import Link from 'next/link';
import { getCatalog } from '@/lib/catalog';
import { bizLook } from '@/lib/look';
import { sql } from '@/lib/db';
import { me } from '@/lib/me';
import LiffGate from '@/components/LiffGate';
import { CustScreen } from '@/components/cust/Gate';

export const dynamic = 'force-dynamic';

// หน้าแรก "บริการ": สวัสดี + 4 ธุรกิจ
export default async function Home() {
  const [cat, m] = await Promise.all([getCatalog(), me()]);
  const [[c], closedRows] = await Promise.all([
    m.code ? sql`select display_name from customers where code = ${m.code}` : Promise.resolve([] as never[]),
    sql`select code from businesses where active and is_closed(code, null, null, (now() at time zone 'Asia/Bangkok')::date)`,
  ]);
  const closedToday = new Set(closedRows.map((r) => r.code as string));
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
      </CustScreen>
    </LiffGate>
  );
}
