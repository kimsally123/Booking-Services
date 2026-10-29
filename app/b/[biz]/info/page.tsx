import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getBizCatalog } from '@/lib/catalog';
import { bizLook } from '@/lib/look';
import { baht } from '@/lib/thaidate';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import { Back } from '@/components/cust/AccountForms';

export const dynamic = 'force-dynamic';
const DOW = ['', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
const SIZE: Record<string, string> = { small: 'น้องตัวเล็ก', large: 'น้องตัวใหญ่', all: 'ทุกขนาด' };

// ปุ่มริชเมนู: tab=price (รอบ/ห้อง/ราคา) · tab=rules (กฎ เงื่อนไข สิ่งที่ต้องเตรียม)
export default async function BizInfo({ params, searchParams }: { params: Promise<{ biz: string }>; searchParams: Promise<{ tab?: string }> }) {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const { biz } = await params;
  const { tab } = await searchParams;
  const cat = await getBizCatalog(biz);
  if (!cat) notFound();
  const b = cat.business;
  const [extra] = await sql`select guide, open_hours from businesses where code = ${biz}`;
  const L = bizLook(b.code, b.color, b.booking_type);
  const rules = tab === 'rules';
  const tierLabel = (c: string) => cat.tiers.find((t) => t.code === c)?.label ?? c;

  return (
    <CustScreen>
      <div className="head"><Back /><b style={{ fontSize: 20, fontWeight: 800 }}>{b.name}</b></div>
      <div className="seg">
        <Link href={`/b/${biz}/info?tab=price`} className={!rules ? 'on' : ''} replace>{b.booking_type === 'session' ? 'รอบและราคา' : b.booking_type === 'slot' ? 'ราคา' : 'ห้องและราคา'}</Link>
        <Link href={`/b/${biz}/info?tab=rules`} className={rules ? 'on' : ''} replace>{b.booking_type === 'slot' ? 'เตรียมน้องก่อนมา' : 'กฎและเงื่อนไข'}</Link>
      </div>

      {!rules && b.booking_type === 'stay' && cat.units.map((u) => (
        <div key={u.code} className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <b style={{ fontSize: 15 }}>{u.name}</b>
          {u.summary && <span className="cap">{u.summary}</span>}
          <span><b className="num">{baht(u.price)}</b> / คืน{u.weekend_price ? <> · ศ.–ส. <b className="num">{baht(u.weekend_price)}</b></> : null}</span>
          {u.pet_fee ? <span className="cap">พาน้องมาด้วย +{baht(u.pet_fee)} / ตัว / คืน</span> : null}
          {u.max_pet_kg ? <span className="cap">รับน้องไม่เกิน {u.max_pet_kg} กก.</span> : null}
        </div>))}

      {!rules && b.booking_type === 'session' && cat.sessions.map((s) => (
        <div key={s.code} className="card" style={{ justifyContent: 'space-between' }}>
          <span className="t"><b>{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</b>
            <small>{s.weekdays.length === 7 ? 'ทุกวัน' : s.weekdays.map((d) => DOW[d]).join(' ')} · {SIZE[s.size_rule]} · รับ {s.capacity} ตัว</small></span>
          <b className="num">{baht(s.price)} / ตัว</b>
        </div>))}

      {!rules && b.booking_type === 'slot' && cat.services.filter((s) => s.kind === 'main').map((s) => (
        <div key={s.code} className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <b style={{ fontSize: 15 }}>{s.name}</b>
          {s.description && <span className="cap">{s.description}</span>}
          {s.price_mode === 'flat'
            ? <span><b className="num">{baht(Number(s.price))}</b> · {s.duration_min} นาที</span>
            : s.prices.map((p) => <div key={p.tier_code} style={{ display: 'flex', justifyContent: 'space-between' }}><span className="cap">{tierLabel(p.tier_code)}</span><b className="num">{baht(p.price)}</b></div>)}
        </div>))}
      {!rules && b.booking_type === 'slot' && cat.tiers.length > 0 && (
        <div className="note">ขนาดตามน้ำหนัก: {cat.tiers.map((t) => `${t.label} ${t.min_kg}–${t.max_kg ?? ''} กก.`).join(' · ')}</div>)}

      {rules && <>
        {extra?.guide && <div className="card" style={{ whiteSpace: 'pre-line', display: 'block' }}>{extra.guide}</div>}
        <div className="list">
          {(b.checkin_time || b.checkout_time) && <div className="li"><span className="ms">schedule</span><span className="t"><b>เข้า {b.checkin_time?.slice(0, 5) ?? '-'} · ออก {b.checkout_time?.slice(0, 5) ?? '-'}</b></span></div>}
          {extra?.open_hours && <div className="li"><span className="ms">storefront</span><span className="t"><b>เวลาเปิด</b><small>{extra.open_hours}</small></span></div>}
          {b.need_vaccine && <div className="li"><span className="ms">vaccines</span><span className="t"><b>ต้องมีวัคซีนที่ยังไม่หมดอายุ</b><small>อัปโหลดสมุดวัคซีนที่ น้องของฉัน ก่อนจอง</small></span></div>}
          <div className="li"><span className="ms">payments</span><span className="t"><b>{b.deposit_type === 'full' ? 'จ่ายเต็มตอนจอง' : b.deposit_type === 'percent' ? `มัดจำ ${b.deposit_value}%` : b.deposit_type === 'first_night' ? 'มัดจำคืนแรก' : `มัดจำ ${baht(Number(b.deposit_value))}`}</b>
            <small>{b.cancel_policy}</small></span></div>
        </div>
        {b.booking_type === 'stay' && cat.units.filter((u) => u.rules).map((u) => (
          <div key={u.code} className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}><b>{u.name}</b><span className="cap">{u.rules}</span></div>))}
      </>}

      <Link href={`/b/${biz}`} className="btn" style={{ background: L.bg, color: L.fg }}>จองเลย</Link>
    </CustScreen>
  );
}
