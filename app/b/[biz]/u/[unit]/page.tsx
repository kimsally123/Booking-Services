import { notFound } from 'next/navigation';
import { getBizCatalog } from '@/lib/catalog';
import { requireCustomer } from '@/components/cust/Gate';
import UnitPage from './UnitPage';

export const dynamic = 'force-dynamic';

// รายละเอียดห้อง/บ้าน (จากการ์ดหน้าแรก หรือหน้าราคา) · ปุ่มจองพาเข้าหน้าจองพร้อมเลือกห้องนี้ไว้
export default async function UnitInfo({ params }: { params: Promise<{ biz: string; unit: string }> }) {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const { biz, unit } = await params;
  const cat = await getBizCatalog(biz);
  const u = cat?.units.find((x) => x.code === unit);
  if (!cat || !u) notFound();
  return <UnitPage biz={cat.business} unit={u} />;
}
