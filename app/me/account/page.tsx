import Link from 'next/link';
import { sql } from '@/lib/db';
import { baht } from '@/lib/thaidate';
import { creditBalance } from '@/lib/orders';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';

export const dynamic = 'force-dynamic';

const MENU = [
  ['receipt_long', 'ใบเสร็จของฉัน', '/me/account/receipts'],
  ['pool', 'ซื้อบัตรสระหลายครั้ง', '/me/account/pass'],
  ['badge', 'ข้อมูลส่วนตัว', '/me/account/profile'],
  ['shield_person', 'ความยินยอม PDPA', '/me/account/pdpa'],
  ['gavel', 'นโยบายมัดจำและยกเลิก', '/me/account/policy'],
  ['support_agent', 'ติดต่อเจ้าหน้าที่', '/me/account/help'],
];

// ฉัน (ตามต้นแบบ: เครดิต · บัตรสระ · คูปอง + เมนู)
export default async function Account() {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const [[c], credit, [pass]] = await Promise.all([
    sql`select display_name, phone from customers where code = ${g.code}`,
    creditBalance(g.code),
    sql`select coalesce(sum(remaining), 0)::int as n from passes where customer_code = ${g.code} and expires_on >= current_date`,
  ]);
  const phone = c.phone ? `${c.phone.slice(0, 3)}-xxx-${c.phone.slice(-4)}` : 'ยังไม่ได้ใส่เบอร์';
  return (
    <CustScreen>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 8 }}>
        <div className="avatar">{c.display_name.replace(/^คุณ/, '').slice(0, 1)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <b style={{ fontSize: 22, fontWeight: 800 }}>{c.display_name}</b><span className="cap">{phone}</span>
        </div>
      </div>
      <div className="wallet">
        <Link href="/me/account/credit" style={{ background: '#FBF5E0' }}><small>เครดิต</small><b className="num">{baht(credit)}</b></Link>
        <Link href="/me/account/pass" style={{ background: '#E3EEFB' }}><small>บัตรสระ</small><b className="num">{pass.n} ครั้ง</b></Link>
        <Link href="/me/account/coupons" style={{ background: '#FBE7E7' }}><small>คูปอง</small><b className="num">0 ใบ</b></Link>
      </div>
      <div className="list">
        {MENU.map(([ic, l, href]) => (
          <Link key={href} href={href} className="li"><span className="ms">{ic}</span><span className="t"><span style={{ fontSize: 16 }}>{l}</span></span><span className="ms go">chevron_right</span></Link>
        ))}
      </div>
    </CustScreen>
  );
}
