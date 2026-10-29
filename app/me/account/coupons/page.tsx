import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import { Back } from '@/components/cust/AccountForms';
import Empty from '@/components/Empty';

export const dynamic = 'force-dynamic';

// คูปอง (เฟส 2)
export default async function Coupons() {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  return (
    <CustScreen>
      <div className="head"><Back /><b style={{ fontSize: 20, fontWeight: 800 }}>คูปอง</b></div>
      <Empty icon="confirmation_number" title="ยังไม่มีคูปอง" text="คูปองจากร้านจะขึ้นที่นี่ และใช้ตอนจองได้" />
    </CustScreen>
  );
}
