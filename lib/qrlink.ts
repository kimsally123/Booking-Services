import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { sql } from './db';
import { appUrl } from './config';
import { promptPayPayload } from './promptpay';

// ลิงก์รูป QR พร้อมเพย์ของการจอง (ใส่ในการ์ด LINE) · มีลายเซ็นกันเดารหัสการจอง
const sig = (code: string) => createHmac('sha256', process.env.SESSION_SECRET || 'dev').update('qr:' + code).digest('base64url').slice(0, 22);
export const qrSigOk = (code: string, s: string) => { const a = Buffer.from(sig(code)), b = Buffer.from(s || ''); return a.length === b.length && timingSafeEqual(a, b); };
// a = ยอด (ให้ LINE โหลดรูปใหม่เมื่อยอดเปลี่ยน)
export function qrUrl(code: string, amount: number): string | null {
  const base = appUrl();
  return base?.startsWith('https://') ? `${base}/api/qr/${encodeURIComponent(code)}?s=${sig(code)}&a=${amount}` : null;
}

// ยอดที่ต้องโอนตอนนี้: ยังไม่ยืนยัน = มัดจำที่เหลือ · ยืนยันแล้วแต่มียอดคงเหลือ = ยอดคงเหลือ
export async function amountDue(code: string): Promise<number> {
  const [o] = await sql`select status, due_now, paid_amount, balance_due from orders where code = ${code}`;
  if (!o) return 0;
  if (o.status === 'holding') return Math.round((Number(o.due_now) - Number(o.paid_amount)) * 100) / 100;
  if (o.status === 'paid') return Number(o.balance_due);
  return 0;
}
// ร้านตั้งเลขพร้อมเพย์แล้วหรือยัง (ยังไม่ตั้ง = ไม่ใส่รูป QR ในการ์ด กันกรอบว่าง)
export async function hasPromptPay(): Promise<boolean> {
  const [r] = await sql`select value from settings where key = 'promptpay_id'`;
  return !!String(r?.value ?? '').replace(/\D/g, '');
}
export async function qrPng(code: string): Promise<Buffer | null> {
  const [r] = await sql`select value from settings where key = 'promptpay_id'`;
  const amt = await amountDue(code);
  if (!r?.value || !(amt > 0)) return null;
  try { return await QRCode.toBuffer(promptPayPayload(String(r.value), amt), { width: 720, margin: 2, errorCorrectionLevel: 'M' }); }
  catch { return null; }
}
