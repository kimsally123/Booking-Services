import Link from 'next/link';
import { sql } from '@/lib/db';
import { baht, thDay } from '@/lib/thaidate';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import { Back } from '@/components/cust/AccountForms';
import Empty from '@/components/Empty';

export const dynamic = 'force-dynamic';

// ใบเสร็จของฉัน: ทุกครั้งที่ร้านยืนยันว่าได้รับเงิน (มัดจำ · ยอดคงเหลือ · จ่ายที่ร้าน)
export default async function Receipts() {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const rows = await sql`
    select p.code, p.order_code, p.amount_slip, p.purpose, to_char(p.reviewed_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD') as d
    from payments p join orders o on o.code = p.order_code
    where o.customer_code = ${g.code} and p.status in ('approved', 'partial') and p.amount_slip > 0
    order by p.reviewed_at desc limit 50`;
  const P: Record<string, string> = { deposit: 'มัดจำ / ชำระตอนจอง', balance: 'ยอดคงเหลือ', shop: 'ชำระที่ร้าน' };
  return (
    <CustScreen>
      <div className="head"><Back /><b style={{ fontSize: 20, fontWeight: 800 }}>ใบเสร็จของฉัน</b></div>
      {!rows.length && <Empty icon="receipt_long" title="ยังไม่มีใบเสร็จ" text="ใบเสร็จจะขึ้นที่นี่หลังร้านยืนยันว่าได้รับเงินแล้ว" />}
      <div className="list">
        {rows.map((r) => (
          <Link key={r.code} href={`/me/account/receipts/${r.code}`} className="li">
            <span className="ms">receipt_long</span>
            <span className="t"><b>{baht(Number(r.amount_slip))}</b><small>{P[r.purpose] ?? ''} · {thDay(r.d)} · {r.order_code}</small></span>
            <span className="ms go">chevron_right</span>
          </Link>
        ))}
      </div>
    </CustScreen>
  );
}
