import { sql } from '@/lib/db';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import { Back, ProfileForm } from '@/components/cust/AccountForms';

export const dynamic = 'force-dynamic';
export default async function Profile() {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const [c] = await sql`select display_name, phone, email, line_user_id is not null as line from customers where code = ${g.code}`;
  return <CustScreen><div className="head"><Back /><b style={{ fontSize: 20, fontWeight: 800 }}>ข้อมูลส่วนตัว</b></div><ProfileForm c={c as never} /></CustScreen>;
}
