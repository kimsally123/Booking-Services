import Link from 'next/link';
import { sql } from '@/lib/db';
import { currentStaff } from '@/lib/staff';
import Head from '@/components/admin/Head';

export const dynamic = 'force-dynamic';

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await currentStaff();
  if (!s) return null;
  const q = ((await searchParams).q || '').trim().slice(0, 40);
  const rows = await sql`
    select c.code, c.display_name, c.phone, (select count(*)::int from orders o where o.customer_code = c.code and o.status = 'paid') as n,
           coalesce((select string_agg(p.name, ', ') from pets p where p.customer_code = c.code), '') as pets
    from customers c
    where ${q} = '' or c.display_name ilike ${'%' + q + '%'} or c.phone like ${'%' + q + '%'}
       or exists (select 1 from pets p where p.customer_code = c.code and p.name ilike ${'%' + q + '%'})
    order by c.created_at desc limit 100`;
  return (
    <>
      <Head back="/admin/menu" cap={`${rows.length} คน`} title="ลูกค้าและน้อง" />
      <form><input className="input" name="q" defaultValue={q} placeholder="ค้นหา ชื่อ · เบอร์ · ชื่อน้อง" /></form>
      <div>
        {rows.map((c) => (
          <Link prefetch={false} key={c.code} href={`/admin/customers/${c.code}`} className="row">
            <span className="t"><b>{c.display_name}</b><small>{[c.phone, c.pets && `น้อง: ${c.pets}`].filter(Boolean).join(' · ')}</small></span>
            <span className="cap">{c.n} ครั้ง</span><span className="ms" style={{ color: 'var(--ink-3)' }}>chevron_right</span>
          </Link>
        ))}
      </div>
    </>
  );
}
