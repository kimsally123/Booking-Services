import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { canSee, currentStaff } from '@/lib/staff';
import { signedUrl } from '@/lib/storage';
import { thRange, thDate } from '@/lib/thaidate';
import { bizLook } from '@/lib/look';
import { getSetting } from '@/lib/catalog';
import Head from '@/components/admin/Head';
import SlipDecision, { ReopenSlip } from '@/components/admin/SlipDecision';

export const dynamic = 'force-dynamic';

export default async function Slip({ params }: { params: Promise<{ code: string }> }) {
  const s = await currentStaff();
  if (!s) return null;
  const { code } = await params;
  const [p] = await sql`select p.*, c.display_name as customer, o.due_now, o.reject_count, o.status as order_status,
      (select coalesce(sum(x.amount_slip), 0) from payments x where x.order_code = p.order_code and x.status = 'partial' and x.code <> p.code) as got
    from payments p join orders o on o.code = p.order_code join customers c on c.code = o.customer_code where p.code = ${code}`;
  if (!p) notFound();
  const items = await sql`
    select b.code as biz, b.name, b.color, b.booking_type as type, coalesce(u.name, sv.name, '') as item, k.guests,
           (k.start_at at time zone 'Asia/Bangkok')::date::text as s, (k.end_at at time zone 'Asia/Bangkok')::date::text as e,
           (select count(*)::int from booking_pets bp where bp.booking_code = k.code) as pets
    from bookings k join businesses b on b.code = k.business_code left join units u on u.code = k.unit_code left join services sv on sv.code = k.service_code
    where k.order_code = ${p.order_code} order by k.start_at`;
  if (!items.some((i) => canSee(s, i.biz))) return <div className="warn">ไม่มีสิทธิ์</div>;
  const url = await signedUrl('slips', p.slip_file);
  const account = await getSetting('account_name');
  const i = items[0]; const L = bizLook(i.biz, i.color, i.type);
  return (
    <>
      <Head back="/admin/slips" cap={p.order_code} title={p.customer} />
      <div style={{ display: 'flex', gap: 14 }}>
        <a href={url} target="_blank" rel="noreferrer" className="photo" style={{ width: 120, height: 160, flex: 'none' }}>{url ? <img src={url} alt="สลิป" /> : <span>สลิป</span>}</a>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="biztag" style={{ background: L.bg, color: L.fg, boxShadow: L.shadow }}>{i.name}</span>
          {items.map((x, k) => <span key={k} style={{ fontSize: 15 }}>{x.item} {x.s !== x.e ? thRange(x.s, x.e) : thDate(x.s)}{x.guests ? ` · ${x.guests} คน` : ''}{x.pets ? ` · น้อง ${x.pets}` : ''}</span>)}
          {account && <span className="cap">บัญชีรับ: {account}</span>}
        </div>
      </div>
      {(() => {
        const c = (p.checks ?? {}) as { flags?: string[]; ok?: string[]; ocr?: string };
        if (!c.flags && !c.ok) return null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="cap">ระบบตรวจเบื้องต้น{c.ocr === 'vision' ? ' (อ่านด้วย Google Vision)' : ''} · ยังต้องเห็นเงินเข้าในแอปธนาคารก่อนกดผ่าน</div>
            {(c.flags ?? []).map((f, k) => <div key={'f' + k} className="err">{f}</div>)}
            {(c.ok ?? []).length > 0 && <div className="note">✓ {(c.ok ?? []).join(' · ')}</div>}
            {p.slip_ref && <div className="cap">เลขอ้างอิงสลิป {p.slip_ref}</div>}
          </div>
        );
      })()}
      {p.status !== 'pending'
        ? <>
            <div className="note">ตรวจแล้ว: {p.status === 'approved' ? `ผ่าน · ${Number(p.amount_slip).toLocaleString('en-US')} บาท` : p.status === 'partial' ? `ได้บางส่วน · ${Number(p.amount_slip).toLocaleString('en-US')} บาท` : `ไม่ผ่าน · ${p.reject_reason}`}
              {p.order_status === 'cancelled' ? ' · การจองถูกยกเลิกแล้ว' : ''}</div>
            {(p.status === 'rejected' || p.status === 'partial') && p.order_status !== 'paid' && <ReopenSlip code={p.code} />}
          </>
        : <SlipDecision code={p.code} due={Number(p.due_now)} got={Number(p.got)} rejects={Number(p.reject_count)}
            slip={p.amount_slip !== null ? Number(p.amount_slip) : p.ocr_amount !== null ? Number(p.ocr_amount) : null} />}
    </>
  );
}
