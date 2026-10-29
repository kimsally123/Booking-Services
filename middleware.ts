import { NextRequest, NextResponse } from 'next/server';

// หน้าฝั่งลูกค้าทุกหน้าต้องล็อกอินด้วย LINE ก่อน
// - เปิดจากริชเมนู (liff.line.me/<LIFF ID>/b/pool) LINE จะส่งมาที่ /?liff.state=/b/pool → พาไปหน้านั้นเลย
// - ยังไม่มีคุกกี้ลูกค้า → /login?next=<หน้าเดิม> ล็อกอินแล้วกลับมาหน้าเดิม
// - กลับจากหน้าล็อกอิน LINE: ต้องส่งค่า code / state / liffClientId / liffRedirectUri ต่อให้ครบ
//   (ไม่งั้น liff.init แลกรหัสไม่ได้ แล้ววนกลับไปหน้าล็อกอิน LINE ซ้ำ)
// ตรวจแค่ว่ามีคุกกี้ (ความถูกต้องของคุกกี้ server ตรวจอีกชั้นในแต่ละหน้า)
const LIFF_KEYS = ['code', 'state', 'liffClientId', 'liffRedirectUri', 'error', 'error_description', 'friendship_status_changed'];
const okPath = (p: string | null) => !!p && p.startsWith('/') && !p.startsWith('//');

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const state = url.searchParams.get('liff.state');
  const demo = process.env.DEMO_MODE === '1' && !process.env.NEXT_PUBLIC_LIFF_ID;   // ตรงกับ demoMode() ใน lib/session
  const hasCookie = !!req.cookies.get('bs_c')?.value;

  // ค่าที่ LINE ส่งกลับมาหลังล็อกอิน (ต้องติดไปด้วยทุกครั้งที่พาไปหน้าอื่น)
  const liffQs = new URLSearchParams();
  for (const k of LIFF_KEYS) { const v = url.searchParams.get(k); if (v !== null) liffQs.set(k, v); }

  // ปลายทางจริง: liff.state (ถ้ามี) ไม่งั้นหน้าที่เปิดอยู่
  let target = url.pathname + url.search;
  if (state) {
    const t = new URL(okPath(state) ? state : '/', req.url);
    liffQs.forEach((v, k) => t.searchParams.set(k, v));
    target = t.pathname + t.search;
  }

  // ไปหน้า /login หรือหน้าพนักงาน (/admin, /staff) → ส่งไปพร้อมค่าจาก LINE เลย ไม่ต้องล็อกอินแบบลูกค้า
  if (state && /^\/(login|admin|staff)(\/|\?|$)/.test(target)) return NextResponse.redirect(new URL(target, req.url));

  if (!demo && !hasCookie) {
    const to = new URL('/login', req.url);
    const next = new URL(target, req.url);
    LIFF_KEYS.forEach((k) => next.searchParams.delete(k));
    to.searchParams.set('next', next.pathname + next.search);
    liffQs.forEach((v, k) => to.searchParams.set(k, v));
    return NextResponse.redirect(to);
  }
  if (state) return NextResponse.redirect(new URL(target, req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/', '/b/:path*', '/me/:path*', '/pay/:path*'] };
