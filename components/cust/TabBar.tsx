'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// เมนูล่างฝั่งลูกค้า (ตามโปรโตไทป์)
const TABS = [
  { href: '/', icon: 'pets', label: 'บริการ', match: (p: string) => p === '/' },
  { href: '/me', icon: 'receipt_long', label: 'การจองของฉัน', match: (p: string) => p === '/me' || p.startsWith('/me/b') },
  { href: '/me/pets', icon: 'sound_detection_dog_barking', label: 'น้องของฉัน', match: (p: string) => p.startsWith('/me/pets') },
  { href: '/me/account', icon: 'person', label: 'ฉัน', match: (p: string) => p.startsWith('/me/account') },
];

export default function TabBar() {
  const path = usePathname() || '/';
  return (
    <nav className="tabbar cust"><div className="in">
      {TABS.map((t) => (
        <Link prefetch={false} key={t.href} href={t.href} className={t.match(path) ? 'on' : ''}>
          <span className="ms">{t.icon}</span>{t.label}
        </Link>
      ))}
    </div></nav>
  );
}
