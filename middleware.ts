import { NextRequest, NextResponse } from 'next/server';

// หน้าฝั่งลูกค้าทุกหน้าต้องล็อกอินด้วย LINE ก่อน
// - เปิดจากริชเมนู (liff.line.me/<LIFF ID>/b/pool) LINE จะส่งมาที่ /?liff.state=/b/pool → พาไปหน้านั้นเลย
// - ยังไม่มีคุกกี้ลูกค้า → /login?next=<หน้าเดิม> ล็อกอินแล้วกลับมาหน้าเดิม
// ตรวจแค่ว่ามีคุกกี้ (ความถูกต้องของคุกกี้ server ตรวจอีกชั้นในแต่ละหน้า)
const safe = (p: string | null) => (p && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/login') ? p : '/');

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const state = url.searchParams.get('liff.state');
  const target = state ? safe(state) : url.pathname + url.search;
  const demo = process.env.DEMO_MODE === '1';
  if (!demo && !req.cookies.get('bs_c')?.value) {
    const to = new URL('/login', req.url);
    to.searchParams.set('next', target);
    return NextResponse.redirect(to);
  }
  if (state) return NextResponse.redirect(new URL(target, req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/', '/b/:path*', '/me/:path*', '/pay/:path*'] };
