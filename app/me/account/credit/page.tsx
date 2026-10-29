import { sql } from '@/lib/db';
import { baht, thDay } from '@/lib/thaidate';
import { creditBalance } from '@/lib/orders';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import { Back } from '@/components/cust/AccountForms';
import Empty from '@/components/Empty';

export const dynamic = 'force-dynamic';

// เครดิต: ได้จากการยกเลิกตามเงื่อนไข · ใช้หักตอนจองได้ทุกธุรกิจ · อายุ 6 เดือน
export default async function Credit() {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const [bal, rows] = await Promise.all([creditBalance(g.code),
    sql`select amount, note, order_code, to_char(created_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD') as d,
               to_char((created_at + interval '6 months') at time zone 'Asia/Bangkok', 'YYYY-MM-DD') as exp
        from credits where customer_code = ${g.code} order by created_at desc limit 50`]);
  return (
    <CustScreen>
      <div className="head"><Back /><b style={{ fontSize: 20, fontWeight: 800 }}>เครดิต</b></div>
      <div className="wallet" style={{ gridTemplateColumns: '1fr' }}><div style={{ background: '#FBF5E0', borderRadius: 16, padding: 14 }}><small className="cap">ใช้ได้</small><br /><b className="num" style={{ fontSize: 28, fontWeight: 800 }}>{baht(bal)}</b></div></div>
      <div className="note">ใช้หักยอดตอนจองได้ทุกธุรกิจ · เครดิตแต่ละก้อนใช้ได้ 6 เดือน</div>
      {!rows.length && <Empty icon="savings" title="ยังไม่มีเครดิต" text="เครดิตจะเข้าเมื่อร้านคืนเงินจากการยกเลิกตามเงื่อนไข" />}
      <div>
        {rows.map((r, k) => (
          <div key={k} className="row">
            <span className="t"><b style={{ fontSize: 15 }}>{r.note || (Number(r.amount) > 0 ? 'ได้รับเครดิต' : 'ใช้เครดิต')}</b>
              <small>{thDay(r.d)}{r.order_code ? ` · ${r.order_code}` : ''}{Number(r.amount) > 0 ? ` · ใช้ได้ถึง ${thDay(r.exp)}` : ''}</small></span>
            <b className="num" style={{ color: Number(r.amount) > 0 ? 'var(--green)' : 'var(--ink)' }}>{Number(r.amount) > 0 ? '+' : '−'}{baht(Math.abs(Number(r.amount)))}</b>
          </div>
        ))}
      </div>
    </CustScreen>
  );
}
