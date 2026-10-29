import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { getOrder } from '@/lib/orders';
import { getSetting } from '@/lib/catalog';
import { oaId } from '@/lib/line';
import { me } from '@/lib/me';
import { promptPayPayload } from '@/lib/promptpay';
import LiffGate from '@/components/LiffGate';
import PayBox from '@/components/PayBox';
import { liffId } from '@/lib/config';

export const dynamic = 'force-dynamic';

// หน้าจ่ายมัดจำ: QR พร้อมเพย์ตามยอด + แนบสลิป
export default async function PayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const m = await me();
  if (!m.code) return <LiffGate loggedIn={false}><main className="app"><div className="body"><div className="warn">เปิดหน้านี้ผ่าน LINE ของร้าน</div></div></main></LiffGate>;
  const o = await getOrder(m.code, code);
  if (!o) notFound();
  const [pp, account, shop, oa, lid] = await Promise.all([getSetting('promptpay_id'), getSetting('account_name'), getSetting('shop_name', 'ร้าน'), oaId(), liffId()]);
  let qr = '';
  // PNG (ไม่ใช่ SVG) ลูกค้ากดค้างที่รูปเพื่อบันทึกได้ในแอป LINE
  try { qr = await QRCode.toDataURL(promptPayPayload(pp, Math.round((Number(o.due_now) - Number(o.paid_amount)) * 100) / 100), { width: 640, margin: 1, errorCorrectionLevel: 'M' }); }
  catch { qr = ''; }   // ยังไม่ได้ตั้งเลขพร้อมเพย์ที่ถูกต้อง
  return <PayBox order={o} qr={qr} account={account} shop={shop} liffId={lid} oa={oa || null} />;
}
