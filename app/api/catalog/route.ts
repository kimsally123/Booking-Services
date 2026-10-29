import { NextRequest, NextResponse } from 'next/server';
import { getBizCatalog } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

// GET /api/catalog?biz=grooming → ข้อมูลร้านของธุรกิจนั้น (ข้อมูลเดียวกับหน้าจอง · ไม่มีข้อมูลลูกค้า)
export async function GET(req: NextRequest) {
  const biz = req.nextUrl.searchParams.get('biz') || '';
  if (!/^[a-z0-9_]{1,40}$/.test(biz)) return NextResponse.json({ message: 'biz ไม่ถูกต้อง' }, { status: 400 });
  const c = await getBizCatalog(biz);
  if (!c) return NextResponse.json({ message: 'ไม่พบธุรกิจนี้' }, { status: 404 });
  return NextResponse.json(c, { headers: { 'cache-control': 'private, max-age=60' } });
}
