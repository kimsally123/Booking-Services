import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import PetForm from '@/components/cust/PetForm';
import { PET_TAGS } from '@/lib/pets';

export const dynamic = 'force-dynamic';

export default async function NewPet({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const { back } = await searchParams;
  return <CustScreen tabs={false}><PetForm tags={PET_TAGS} back={back && back.startsWith('/b/') ? back : null} /></CustScreen>;
}
