import { notFound } from 'next/navigation';
import { getBizCatalog, getPets } from '@/lib/catalog';
import { me } from '@/lib/me';
import { creditBalance } from '@/lib/orders';
import { todayTH } from '@/lib/thaidate';
import BookingFlow from '@/components/BookingFlow';
import Consent from '@/components/Consent';
import LiffGate from '@/components/LiffGate';

export const dynamic = 'force-dynamic';

// หน้าจองของแต่ละธุรกิจ · ริชเมนูแต่ละอันเปิด LIFF มาที่ /b/<รหัสธุรกิจ>
export default async function BizPage({ params, searchParams }: { params: Promise<{ biz: string }>; searchParams: Promise<{ date?: string; service?: string; unit?: string }> }) {
  const { biz } = await params;
  const sp = await searchParams;
  const cat = await getBizCatalog(biz);
  if (!cat) notFound();
  const m = await me();
  if (m.code && !m.consented) return <Consent shop={cat.shop_name} />;
  const [pets, credit] = m.code ? await Promise.all([getPets(m.code), creditBalance(m.code)]) : [[], 0];
  return (
    <LiffGate loggedIn={!!m.code}>
      <BookingFlow cat={cat} pets={pets} credit={credit} loggedIn={!!m.code} today={todayTH()} initial={{ date: sp.date, service: sp.service, unit: sp.unit }} />
    </LiffGate>
  );
}
