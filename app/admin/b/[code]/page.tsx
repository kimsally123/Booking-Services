import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { canSee, currentStaff } from '@/lib/staff';
import { nextAction, type DayRow } from '@/lib/admin';
import { signedUrl } from '@/lib/storage';
import { baht, daysBetween, thDate, todayTH } from '@/lib/thaidate';
import { bizLook } from '@/lib/look';
import { BOOK_ST, ORDER_ST, Pill } from '@/lib/status';
import Head from '@/components/admin/Head';
import ActBtn from '@/components/admin/ActBtn';
import CancelOrder, { CollectAtShop, MarkRefunded } from '@/components/admin/CancelOrder';
import Reschedule from '@/components/admin/Reschedule';
import { vaxState } from '@/lib/vax';

export const dynamic = 'force-dynamic';

const PAY_ST: Record<string, [string, string, string]> = { pending: ['รอตรวจ', '#FDF5DC', '#8A5A00'], approved: ['ผ่าน', '#E4F3EA', '#1E7B4A'], rejected: ['ไม่ผ่าน', '#FBE3E4', '#B8262E'] };

// รายละเอียดการจอง (พนักงาน)
export default async function BookingDetail({ params }: { params: Promise<{ code: string }> }) {
  const s = await currentStaff();
  if (!s) return null;
  const { code } = await params;
  const [o] = await sql`select o.*, o.balance_due_by::text as balance_due_by, c.display_name as customer, c.phone, c.code as ccode from orders o join customers c on c.code = o.customer_code where o.code = ${code}`;
  if (!o) notFound();
  const items = await sql`
    select k.code, k.order_code, k.business_code, b.name as biz, b.color, b.booking_type, k.kind, k.status, k.price, k.guests, k.staff_code,
           ${o.status}::text as order_status,
           to_char(k.start_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as s, to_char(k.end_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as e,
           coalesce(u.name, '') as unit, coalesce(sv.name, '') as service, coalesce(st.display_name, '') as staff, k.addon_codes, k.service_code, k.session_code,
           (select tier_for(max(p.weight_kg)) from booking_pets bp join pets p on p.code = bp.pet_code where bp.booking_code = k.code) as tier,
           coalesce((select array_agg(p.weight_kg) from booking_pets bp join pets p on p.code = bp.pet_code where bp.booking_code = k.code), '{}') as kgs,
           coalesce((select string_agg(p.name, ', ') from booking_pets bp join pets p on p.code = bp.pet_code where bp.booking_code = k.code), '') as pets
    from bookings k join businesses b on b.code = k.business_code
    left join units u on u.code = k.unit_code left join services sv on sv.code = k.service_code left join staff st on st.code = k.staff_code
    where k.order_code = ${code} order by k.start_at`;
  if (!items.some((i) => canSee(s, i.business_code))) return <div className="warn">ไม่มีสิทธิ์ดูการจองนี้</div>;
  const [pay] = await sql`select * from payments where order_code = ${code} order by created_at desc limit 1`;
  const pets = await sql`
    select p.code, p.name, p.breed, p.weight_kg, p.tags, p.note,
      coalesce((select json_agg(json_build_object('status', v.status, 'expires_on', v.expires_on::text)) from pet_vaccines v where v.pet_code = p.code), '[]') as vaccines
    from pets p where p.code in (select bp.pet_code from booking_pets bp join bookings k on k.code = bp.booking_code where k.order_code = ${code})`;
  const slipUrl = pay ? await signedUrl('slips', pay.slip_file) : '';
  const today = todayTH();
  const mismatch = pay && pay.amount_slip !== null && Number(pay.amount_slip) !== Number(pay.amount_due);
  const guests = items.reduce((a, i) => a + (i.guests || 0), 0);
  const petN = pets.length;
  const paid = Number(o.paid_amount);
  const due = o.status === 'cancelled' || o.status === 'expired' ? 0 : Number(o.total) - paid;

  return (
    <>
      <Head back="/admin" cap={`${o.code} · รายละเอียดการจอง`} title={o.customer} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Pill s={o.status === 'pending_review' ? ['รอตรวจสลิป', '#FDF5DC', '#8A5A00'] : ORDER_ST[o.status]} />
        {mismatch && <span className="pill" style={{ background: '#FBE3E4', color: '#B8262E' }}>⚠ ยอดไม่ตรง</span>}
        <span className="cap">{[guests ? `${guests} คน` : '', petN ? `น้อง ${petN}` : ''].filter(Boolean).join(' + ')}</span>
      </div>

      {items.map((i) => {
        const L = bizLook(i.business_code, i.color, i.booking_type);
        const sd = i.s.slice(0, 10), ed = i.e.slice(0, 10);
        const r = { ...i, phase: sd === today ? 'start' : ed === today ? 'end' : sd > today ? 'start' : 'during', time: '', title: '' } as unknown as DayRow;
        const a = nextAction(r);
        const title = i.kind === 'stay' ? `${i.unit} · ${daysBetween(sd, ed)} คืน` : i.kind === 'session' ? `รอบ ${i.s.slice(11)}` : i.service;
        return (
          <div key={i.code} className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 16, borderRadius: 18 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: L.bg, color: L.fg, boxShadow: L.shadow, display: 'grid', placeItems: 'center' }}><span className="ms">{L.icon}</span></span>
              <span className="t"><small>{i.biz} · {i.code}</small><b style={{ fontSize: 18 }}>{title}</b></span>
              <Pill s={BOOK_ST[i.status]} />
            </div>
            <div className="stat"><span>วันที่</span><b>{thDate(sd)} {i.kind === 'stay' ? 'เข้า ' : ''}{i.s.slice(11)}{i.kind === 'stay' ? ` → ${thDate(ed)} ออก ${i.e.slice(11)}` : `–${i.e.slice(11)}`}</b></div>
            {i.pets && <div className="stat"><span>น้อง</span><b>{i.pets}</b></div>}
            {i.staff && <div className="stat"><span>ช่าง</span><b>พี่{i.staff}</b></div>}
            <div className="stat"><span>ราคา</span><b className="num">{baht(i.price)}</b></div>
            {a ? <ActBtn code={i.code} action={a[0]} label={a[1]} big /> : o.status !== 'paid' && ['holding'].includes(i.status) ? <b style={{ fontSize: 14 }}>รอสลิปผ่านก่อน</b> : null}
            {['holding', 'confirmed'].includes(i.status) && canSee(s, i.business_code) && (
              <Reschedule p={{ code: i.code, kind: i.kind, business: i.business_code, date: sd, nights: Math.max(1, daysBetween(sd, ed)), service: i.service_code,
                               addons: i.addon_codes, tier: i.tier, kg: (i.kgs as number[]).map(Number), session: i.session_code }} />
            )}
          </div>
        );
      })}

      <div className="grp">การชำระเงินและสลิป{pay && <Pill s={PAY_ST[pay.status]} />}</div>
      {pay ? (
        <div style={{ display: 'flex', gap: 14 }}>
          <a href={slipUrl} target="_blank" rel="noreferrer" className="photo" style={{ width: 72, height: 96, flex: 'none' }}>{slipUrl ? <img src={slipUrl} alt="สลิป" /> : <span>สลิป</span>}</a>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="chk"><span className="ms ok">check_circle</span><span className="t"><b>ลูกค้าแนบสลิป</b><small>ยอดที่ต้องจ่าย {baht(pay.amount_due)}{pay.amount_slip !== null ? ` · ในสลิป ${baht(pay.amount_slip)}` : ''}</small></span></div>
            {pay.amount_slip !== null && (mismatch
              ? <div className="chk"><span className="ms" style={{ color: 'var(--red-ink)' }}>cancel</span><span className="t"><b>ยอดไม่ตรง</b><small>{Number(pay.amount_slip) < Number(pay.amount_due) ? `ขาด ${baht(Number(pay.amount_due) - Number(pay.amount_slip))}` : `เกิน ${baht(Number(pay.amount_slip) - Number(pay.amount_due))}`}</small></span></div>
              : <div className="chk"><span className="ms ok">check_circle</span><span className="t"><b>ยอดตรง</b></span></div>)}
            <div className="chk"><span className="ms" style={{ color: pay.status === 'approved' ? 'var(--green)' : pay.status === 'rejected' ? 'var(--red-ink)' : '#B07A12' }}>{pay.status === 'approved' ? 'check_circle' : pay.status === 'rejected' ? 'cancel' : 'schedule'}</span>
              <span className="t"><b>{pay.status === 'approved' ? 'ร้านตรวจแล้ว' : pay.status === 'rejected' ? `ไม่ผ่าน · ${pay.reject_reason ?? ''}` : 'รอร้านตรวจ'}</b><small>{pay.status === 'pending' ? 'ลูกค้ายังไม่ได้รับการยืนยัน' : ''}</small></span></div>
          </div>
        </div>
      ) : <div className="note">{o.status === 'holding' ? 'ลูกค้ายังไม่แนบสลิป · กันที่ไว้ให้อยู่' : o.due_now === 0 ? 'ไม่ต้องจ่ายมัดจำ' : 'ไม่มีสลิป'}</div>}

      <div>
        <div className="stat"><span>ยอดรวม</span><b className="num">{baht(o.total)}</b></div>
        <div className="stat"><span>ชำระแล้ว</span><b className="num">{baht(paid)}</b></div>
        {Number(o.balance_due) > 0 && <div className="stat"><span>ยอดคงเหลือออนไลน์ (ก่อน {o.balance_due_by ? thDate(String(o.balance_due_by).slice(0, 10)) : '-'})</span><b className="num" style={{ color: 'var(--red-ink)' }}>{baht(Number(o.balance_due))}</b></div>}
        {due - Number(o.balance_due) > 0 && <div className="stat"><span>ค้างชำระ (จ่ายที่ร้าน)</span><b className="num" style={{ color: 'var(--red-ink)' }}>{baht(due - Number(o.balance_due))}</b></div>}
        {o.refund_status && <div className="stat"><span>คืนเงิน</span><b>{({ pending: 'รอโอนคืน', credited: 'คืนเป็นเครดิตแล้ว', refunded: 'โอนคืนแล้ว', forfeited: 'ไม่คืน' } as Record<string, string>)[o.refund_status]} {Number(o.refund_amount) > 0 ? baht(Number(o.refund_amount)) : ''}</b></div>}
        <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '8px 0' }} />
        <div className="stat"><span>เบอร์ลูกค้า</span><b className="num">{o.phone || '-'}</b></div>
      </div>

      {pets.length > 0 && <div className="grp">น้องในการจองนี้</div>}
      {pets.map((p) => { const v = vaxState(p.vaccines, today); return (
        <div key={p.code} className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{p.name} <span className="cap">{[p.breed, `${p.weight_kg} กก.`].filter(Boolean).join(' · ')}</span></b>
            <span className="pill" style={{ background: v[1], color: v[2] }}>{v[0]}</span></div>
          {(p.tags.length > 0 || p.note) && <span style={{ color: 'var(--red-ink)', fontSize: 13, fontWeight: 700 }}>⚠ {[...p.tags, p.note].filter(Boolean).join(' · ')}</span>}
        </div>); })}

      {pay?.status === 'pending' && <Link prefetch={false} href={`/admin/slips/${pay.code}`} className="btnw dark">ตรวจสลิป</Link>}
      {o.phone && <a href={`tel:${o.phone}`} className="btnw line">โทรหาลูกค้า</a>}
      <Link prefetch={false} href={`/admin/customers/${o.ccode}`} className="btnw line">ดูลูกค้าและน้อง</Link>
      {o.change_request && <div className="note y">ลูกค้าขอ: {o.change_request}</div>}
      {o.refund_status === 'pending' && s.role !== 'staff' && <MarkRefunded order={o.code} amount={Number(o.refund_amount)} />}
      {o.status === 'paid' && <CollectAtShop order={o.code} owe={due} />}
      <CancelOrder order={o.code} canCancel={s.role !== 'staff'} codes={items.filter((i) => ['holding', 'confirmed', 'checked_in', 'in_progress'].includes(i.status) && canSee(s, i.business_code)).map((i) => i.code)} />
    </>
  );
}
