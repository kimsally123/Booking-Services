import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

// คุกกี้ล็อกอินแบบเซ็นด้วย SESSION_SECRET (ไม่มีข้อมูลลับในคุกกี้ มีแค่รหัสลูกค้า/พนักงาน)
const COOKIE = 'bs_c';
const STAFF_COOKIE = 'bs_s';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 วัน

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('ต้องตั้ง SESSION_SECRET (ยาวอย่างน้อย 32 ตัวอักษร)');
  return s;
}
function sign(v: string) {
  return createHmac('sha256', secret()).update(v).digest('base64url');
}
export function seal(code: string): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const body = `${code}.${exp}`;
  return `${body}.${sign(body)}`;
}
export function unseal(token: string | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const body = token.slice(0, i), mac = token.slice(i + 1);
  const want = sign(body);
  if (mac.length !== want.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  const j = body.lastIndexOf('.');
  const code = body.slice(0, j), exp = body.slice(j + 1);
  if (!code || Number(exp) < Date.now() / 1000) return null;
  return code;
}

const opts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: MAX_AGE };

// ใส่ชนิดไว้ในค่าที่เซ็น กันเอาคุกกี้ลูกค้าไปใช้เป็นคุกกี้พนักงาน
export async function setCustomerCookie(code: string) { (await cookies()).set(COOKIE, seal('c:' + code), opts); }
export async function setStaffCookie(code: string) { (await cookies()).set(STAFF_COOKIE, seal('s:' + code), opts); }
export async function clearStaffCookie() { (await cookies()).delete(STAFF_COOKIE); }

// โหมดเดโม่ใช้ได้เฉพาะเครื่องทดลองที่ยังไม่มี LIFF · ใส่ LIFF ID แล้วปิดเองทันที (กันทุกคนเป็นลูกค้าคนเดียวกัน และกันเข้าหลังบ้านโดยไม่ล็อกอิน)
export const demoMode = () => process.env.DEMO_MODE === '1' && !process.env.NEXT_PUBLIC_LIFF_ID;

// ลูกค้าที่ล็อกอินอยู่ (โหมดเดโม่: ลูกค้าสมมติจาก env)
export async function currentCustomer(): Promise<string | null> {
  const c = unseal((await cookies()).get(COOKIE)?.value);
  if (c?.startsWith('c:')) return c.slice(2);
  if (demoMode() && process.env.DEMO_CUSTOMER) return process.env.DEMO_CUSTOMER;
  return null;
}

export async function staffCookie(): Promise<string | null> {
  const s = unseal((await cookies()).get(STAFF_COOKIE)?.value);
  return s?.startsWith('s:') ? s.slice(2) : null;
}
