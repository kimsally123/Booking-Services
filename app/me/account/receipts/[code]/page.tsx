import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { baht, thDate, thDay } from '@/lib/thaidate';
import { getSetting } from '@/lib/catalog';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import { Back } from '@/components/cust/AccountForms';
import PrintBtn from '@/components/cust/PrintBtn';

export const dynamic = 'force-dynamic';

// ใบเสร็จรับเงิน (ใบเดียวต่อการรับเงินหนึ่งครั้ง) · พิมพ์/บันทึก PDF จากเบราว์เซอร์ได้
export default async function Receipt({ params }: { params: Promise<{ code: string }> }) {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const { code } = await params;
  const [p] = await sql`
    select p.code, p.order_code, p.amount_slip, p.purpose, p.method, to_char(p.reviewed_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD') as d,
           o.total, o.paid_amount, c.display_name
    from payments p join orders o on o.code = p.order_code join customers c on c.code = o.customer_code
    where p.code = ${code} and o.customer_code = ${g.code} and p.status in ('approved', 'partial')`;
  if (!p) notFound();
  const [items, legal, shop, phone] = await Promise.all([
    sql`select b.name as biz, coalesce(u.name, sv.name, '') as item, k.price, (k.start_at at time zone 'Asia/Bangkok')::date::text as s
        from bookings k join businesses b on b.code = k.business_code left join units u on u.code = k.unit_code left join services sv on sv.code = k.service_code
        where k.order_code = ${p.order_code} order by k.start_at`,
    getSetting('legal_name'), getSetting('shop_name', 'ร้าน'), getSetting('shop_phone'),
  ]);
  const P: Record<string, string> = { deposit: 'มัดจำ / ชำระตอนจอง', balance: 'ยอดคงเหลือ', shop: 'ชำระที่ร้าน' };
  return (
    <CustScreen tabs={false}>
      <div className="head noprint"><Back /><b style={{ fontSize: 20, fontWeight: 800 }}>ใบเสร็จรับเงิน</b></div>
      <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <b style={{ fontSize: 18 }}>{legal || shop}</b>
        {phone && <span className="cap">โทร {phone}</span>}
        <div className="cap">เลขที่ {p.code} · วันที่ {thDay(p.d)}</div>
        <div className="cap">ได้รับเงินจาก {p.display_name} · การจอง {p.order_code}</div>
        <div className="bill">
          {items.map((i, k) => <div key={k} className="l"><span>{i.biz} · {i.item} ({thDate(i.s)})</span><span className="num">{baht(Number(i.price))}</span></div>)}
          <hr />
          <div className="l"><span>ยอดรวมการจอง</span><span className="num">{baht(Number(p.total))}</span></div>
          <div className="l tot"><span>รับเงินครั้งนี้ · {P[p.purpose]}{p.method === 'cash' ? ' (เงินสด)' : ' (โอน)'}</span><span className="num">{baht(Number(p.amount_slip))}</span></div>
          <div className="l"><span>รับแล้วทั้งหมด</span><span className="num">{baht(Number(p.paid_amount))}</span></div>
        </div>
      </div>
      <PrintBtn />
    </CustScreen>
  );
}
