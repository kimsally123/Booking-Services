import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { todayTH } from '@/lib/thaidate';
import { PET_TAGS } from '@/lib/pets';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import PetDetail from '@/components/cust/PetDetail';

export const dynamic = 'force-dynamic';

export default async function PetPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ back?: string }> }) {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const { code } = await params;
  const { back } = await searchParams;
  const [p] = await sql`
    select p.code, p.name, p.species, p.breed, p.weight_kg, p.tags, p.photo,
      coalesce((select json_agg(json_build_object('id', v.id, 'vaccine', v.vaccine, 'expires_on', to_char(v.expires_on, 'YYYY-MM-DD'),
                                                  'status', v.status, 'reason', v.reject_reason) order by v.created_at desc)
                from pet_vaccines v where v.pet_code = p.code), '[]') as vaccines
    from pets p where p.code = ${code} and p.customer_code = ${g.code}`;
  if (!p) notFound();
  return <CustScreen><PetDetail pet={p as never} today={todayTH()} tags={PET_TAGS} back={back && back.startsWith('/b/') ? back : null} /></CustScreen>;
}
