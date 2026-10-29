import Link from 'next/link';
import { getBizCatalog, getCatalog } from '@/lib/catalog';
import { Photo } from '@/components/ui';
import { baht } from '@/lib/thaidate';
import { bizLook } from '@/lib/look';
import { sql } from '@/lib/db';
import { me } from '@/lib/me';
import LiffGate from '@/components/LiffGate';
import BookingCard from '@/components/cust/BookingCard';
import { CustScreen } from '@/components/cust/Gate';
import { myOrders } from '@/lib/orders';

export const dynamic = 'force-dynamic';

// หน้าแรก "บริการ": สวัสดี + 4 ธุรกิจ
export default async function Home() {
  const [cat, m] = await Promise.all([getCatalog(), me()]);
  const [[c], closedRows] = await Promise.all([
    m.code ? sql`select display_name from customers where code = ${m.code}` : Promise.resolve([] as never[]),
    sql`select code from businesses where active and is_closed(code, null, null, (now() at time zone 'Asia/Bangkok')::date)`,
  ]);
  const closedToday = new Set(closedRows.map((r) => r.code as string));
  // การ์ดที่พักเลื่อนข้าง: บ้านพักคน (Villa) แถวหนึ่ง · ห้องพักน้อง (Pet hotel) อีกแถว
  const stays = (await Promise.all(cat.businesses.filter((b) => b.booking_type === 'stay')
    .sort((a, z) => (a.code === 'villa' ? -1 : z.code === 'villa' ? 1 : 0)).map((b) => getBizCatalog(b.code)))).filter((x) => x && x.units.length);
  // การจองที่ยังไม่ถึงวัน/กำลังใช้ (ตามต้นแบบหน้าแรก)
  const now = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
  const upcoming = m.code ? (await myOrders(m.code)).filter((o) => ['holding', 'pending_review', 'paid'].includes(o.status)
    && o.items.some((i) => !['cancelled', 'expired', 'done', 'no_show'].includes(i.status) && i.e >= now)).slice(0, 5) : [];
  return (
    <LiffGate loggedIn={!!m.code}>
      <CustScreen>
        <div className="cap" style={{ fontSize: 15 }}>สวัสดี {c?.display_name ?? ''}</div>
        <div className="title" style={{ marginTop: -6 }}>วันนี้ให้น้องทำอะไรดี</div>
        <div className="tiles2">
          {cat.businesses.map((b) => {
            const L = bizLook(b.code, b.color, b.booking_type);
            return (
              <Link key={b.code} href={`/b/${b.code}`} className="btile" style={{ background: L.bg, color: L.fg, boxShadow: L.shadow }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="ms">{L.icon}</span>
                  {closedToday.has(b.code) && <span className="closed">ปิดวันนี้</span>}
                </span>
                <span><b>{b.name}</b><small>{closedToday.has(b.code) ? 'วันนี้ปิด · เลือกวันอื่นได้' : b.tagline}</small></span>
              </Link>
            );
          })}
        </div>
        {upcoming.length > 0 && <div className="section" style={{ marginTop: 14, color: 'var(--ink-2)' }}>การจองของฉัน</div>}
        {upcoming.map((o) => <BookingCard key={o.code} o={o as never} biz={cat.businesses as never} />)}
        {stays.map((sc) => { const b = sc!.business; return (
          <section key={b.code} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            <div className="section" style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-2)' }}>
              <span>{b.code === 'villa' ? 'บ้านพักสำหรับคน' : 'ห้องพักสำหรับน้อง'} · {b.name}</span>
              <Link href={`/b/${b.code}`} style={{ fontSize: 13, textDecoration: 'underline' }}>จอง</Link>
            </div>
            <div className="hrow">{sc!.units.map((u) => (
              <Link key={u.code} href={`/b/${b.code}/u/${u.code}`} className="hcard">
                <Photo file={u.photos.find((p) => p.is_cover)?.file ?? u.photos[0]?.file} label={u.name} />
                <span className="b"><b>{u.name}</b><small className="cap">{u.summary}</small>
                  <span><small className="cap">เริ่ม </small><b className="num">{baht(Number(u.price))}</b><small className="cap">/คืน</small></span></span>
              </Link>))}</div>
          </section>); })}
      </CustScreen>
    </LiffGate>
  );
}
