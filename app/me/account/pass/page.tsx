import { sql } from '@/lib/db';
import { thDay } from '@/lib/thaidate';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import { Back } from '@/components/cust/AccountForms';
import Empty from '@/components/Empty';

export const dynamic = 'force-dynamic';

// บัตรสระหลายครั้ง (เฟส 2) · ตอนนี้แสดงบัตรที่มี · ยังไม่เปิดขายออนไลน์
export default async function Pass() {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const rows = await sql`select code, remaining, total_uses, expires_on::text as exp from passes where customer_code = ${g.code} and expires_on >= current_date order by expires_on`;
  return (
    <CustScreen>
      <div className="head"><Back /><b style={{ fontSize: 20, fontWeight: 800 }}>ซื้อบัตรสระหลายครั้ง</b></div>
      <div className="warn"><span className="ms">info</span>ใช้ได้กับทุกรอบ · น้องตัวไหนก็ได้ในบัญชี</div>
      {rows.map((r) => (
        <div key={r.code} className="row"><span className="t"><b>เหลืออยู่</b><small>ใช้ได้ถึง {thDay(r.exp)}</small></span><b className="num">{r.remaining} ครั้ง</b></div>
      ))}
      <Empty icon="pool" title="เปิดขายบัตรเร็ว ๆ นี้" text="ระหว่างนี้จองรอบสระรายครั้งได้ที่หน้าบริการ · ถามร้านเรื่องบัตรหลายครั้งได้ทางแชท" action={{ label: 'จองรอบสระ', href: '/b/pool' }} />
    </CustScreen>
  );
}
