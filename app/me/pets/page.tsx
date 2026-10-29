import Link from 'next/link';
import { sql } from '@/lib/db';
import { todayTH } from '@/lib/thaidate';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import { Photo } from '@/components/ui';
import { vaxState } from '@/lib/vax';

export const dynamic = 'force-dynamic';

// น้องของฉัน
export default async function MyPets({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const { back } = await searchParams;
  const today = todayTH();
  const pets = await sql`
    select p.code, p.name, p.breed, p.weight_kg, p.species, p.photo,
      coalesce((select json_agg(json_build_object('status', v.status, 'expires_on', to_char(v.expires_on, 'YYYY-MM-DD')))
                from pet_vaccines v where v.pet_code = p.code), '[]') as vaccines
    from pets p where p.customer_code = ${g.code} order by p.created_at, p.code`;
  const q = back && back.startsWith('/b/') ? `?back=${encodeURIComponent(back)}` : '';
  return (
    <CustScreen>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="title">น้องของฉัน</div>
        <Link href={`/me/pets/new${q}`} className="pbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span className="ms" style={{ fontSize: 20 }}>add</span>เพิ่มน้อง</Link>
      </div>
      {back && <Link href={back} className="note y">กลับไปจองต่อ ›</Link>}
      {!pets.length && <div className="note" style={{ textAlign: 'center' }}>ยังไม่มีน้องในบัญชี · กด &quot;เพิ่มน้อง&quot;</div>}
      {pets.map((p) => {
        const v = vaxState(p.vaccines, today);
        return (
          <Link key={p.code} href={`/me/pets/${p.code}${q}`} className="card" style={{ padding: 16 }}>
            <Photo file={p.photo} h={64} label="" />
            <span className="t"><b>{p.name}</b><small>{[p.breed, `${p.weight_kg} กก.`].filter(Boolean).join(' · ')}</small>
              <span className="pill" style={{ background: v[1], color: v[2], alignSelf: 'flex-start' }}>{v[0]}</span></span>
            <span className="ms" style={{ color: 'var(--ink-3)' }}>chevron_right</span>
          </Link>
        );
      })}
    </CustScreen>
  );
}
