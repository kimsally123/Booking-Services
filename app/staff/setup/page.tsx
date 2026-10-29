import StaffLogin from '@/components/StaffLogin';

export const dynamic = 'force-dynamic';

// ผูก LINE เจ้าของร้านคนแรก: /staff/setup?k=<SETUP_KEY> · ใช้ได้เฉพาะตอนยังไม่มีเจ้าของที่ผูก LINE
export default async function Setup({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  return <StaffLogin mode="setup" token={k} />;
}
