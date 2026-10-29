import { liffId } from '@/lib/config';
import { getSetting } from '@/lib/catalog';
import { oaId } from '@/lib/line';
import LoginClient from './LoginClient';

export const dynamic = 'force-dynamic';

// หน้าล็อกอินลูกค้า: ทุกหน้าฝั่งลูกค้าพามาที่นี่ก่อน แล้วกลับไปหน้าเดิม (next)
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const [id, oa, shop] = await Promise.all([liffId(), oaId(), getSetting('shop_name', 'ร้าน')]);
  return <LoginClient liffId={id} next={next ?? '/'} oa={oa || null} shop={shop || 'ร้าน'} />;
}
