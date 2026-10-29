'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// เมนูล่างหลังบ้าน (ตามโปรโตไทป์)
export default function AdminTabBar({ slips }: { slips: number }) {
  const p = usePathname() || '/admin';
  const on = (k: string) => (k === 'today' ? p === '/admin' : k === 'cal' ? p.startsWith('/admin/cal') : k === 'slips' ? p.startsWith('/admin/slips') : !['/admin'].includes(p) && !p.startsWith('/admin/cal') && !p.startsWith('/admin/slips'));
  const T: [string, string, string, string][] = [['today', '/admin', 'today', 'วันนี้'], ['cal', '/admin/cal', 'calendar_month', 'ปฏิทิน'], ['slips', '/admin/slips', 'receipt_long', 'สลิป'], ['menu', '/admin/menu', 'menu', 'เมนู']];
  return (
    <nav className="tabbar"><div className="in">
      {T.map(([k, href, ic, l]) => (
        <Link prefetch={false} key={k} href={href} className={on(k) ? 'on' : ''}>
          <span className="ms">{ic}</span>{l}
          {k === 'slips' && slips > 0 && <span className="badge">{slips}</span>}
        </Link>
      ))}
    </div></nav>
  );
}
