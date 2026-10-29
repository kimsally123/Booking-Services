import { sql } from '@/lib/db';
import BookingCard from '@/components/cust/BookingCard';
import { myOrders } from '@/lib/orders';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import Empty from '@/components/Empty';

export const dynamic = 'force-dynamic';

// การจองของฉัน
export default async function MyBookings() {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const [orders, biz] = await Promise.all([myOrders(g.code), sql`select code, color, booking_type from businesses`]);
  return (
    <CustScreen>
      <div className="title">การจองของฉัน</div>
      {!orders.length && <Empty icon="receipt_long" title="ยังไม่มีการจอง" text="จองที่พัก สระ หรือ Grooming ให้น้องได้เลย การจองทั้งหมดจะอยู่ที่นี่" action={{ label: 'จองบริการ', href: '/' }} />}
      {orders.map((o) => <BookingCard key={o.code} o={o as never} biz={biz as never} />)}
    </CustScreen>
  );
}
