'use client';
import { useRouter } from 'next/navigation';
import type { Business, Unit } from '@/lib/types';
import UnitDetail from '@/components/UnitDetail';

export default function UnitPage({ biz, unit }: { biz: Business; unit: Unit }) {
  const router = useRouter();
  const back = () => (history.length > 1 ? router.back() : router.push('/'));
  return <UnitDetail biz={biz} unit={unit} onBack={back}
    action={{ label: biz.code === 'villa' ? 'จองหลังนี้' : 'จองห้องนี้', sub: 'เริ่ม', price: `฿${Math.round(Number(unit.price)).toLocaleString('en-US')}/คืน`,
      onClick: () => router.push(`/b/${biz.code}?unit=${encodeURIComponent(unit.code)}`) }} />;
}
