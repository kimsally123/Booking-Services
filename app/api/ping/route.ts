import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getBizCatalog, getCatalog, getPets } from '@/lib/catalog';
import { me } from '@/lib/me';
import { liffId } from '@/lib/config';

export const dynamic = 'force-dynamic';

// วัดความเร็ว: server อยู่ภูมิภาคไหน + ยิงฐานข้อมูลไปกลับใช้กี่ ms (ไม่มีข้อมูลลูกค้า)
// /api/ping?full=1 → จับเวลาทีละขั้นของหน้าแรกและหน้าจอง (ขั้นไหนเกิน 8 วินาทีขึ้น "ค้าง")
const race = async (name: string, f: () => Promise<unknown>) => {
  const t = Date.now();
  try {
    await Promise.race([f(), new Promise((_, no) => setTimeout(() => no(new Error('ค้างเกิน 8 วินาที')), 8000))]);
    return [name, Date.now() - t] as const;
  } catch (e) {
    return [name, `${(e as Error).message} (${Date.now() - t}ms)`] as const;
  }
};

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const ms: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    await sql`select 1`;
    ms.push(Date.now() - t);
  }
  const out: Record<string, unknown> = {
    server_region: process.env.VERCEL_REGION ?? 'local',
    db_first_ms: ms[0],
    db_next_ms: ms.slice(1),
  };
  if (req.nextUrl.searchParams.get('full')) {
    const steps = [];
    steps.push(await race('me', () => me()));
    steps.push(await race('liff_id', () => liffId()));
    steps.push(await race('catalog', () => getCatalog()));
    steps.push(await race('biz_pet_hotel', () => getBizCatalog('pet_hotel')));
    steps.push(await race('pets_demo', async () => { const m = await me(); return m.code ? getPets(m.code) : null; }));
    steps.push(await race('parallel_8', () => Promise.all(Array.from({ length: 8 }, () => sql`select 1`))));
    out.steps = Object.fromEntries(steps);
  }
  out.total_ms = Date.now() - t0;
  return Response.json(out, { headers: { 'cache-control': 'no-store' } });
}
