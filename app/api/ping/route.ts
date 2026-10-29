import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

// วัดความเร็ว: server อยู่ภูมิภาคไหน + ยิงฐานข้อมูลไปกลับใช้กี่ ms (ไม่มีข้อมูลลูกค้า)
export async function GET() {
  const t0 = Date.now();
  const ms: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    await sql`select 1`;
    ms.push(Date.now() - t);
  }
  return Response.json({
    server_region: process.env.VERCEL_REGION ?? 'local',
    db_first_ms: ms[0],
    db_next_ms: ms.slice(1),
    total_ms: Date.now() - t0,
  }, { headers: { 'cache-control': 'no-store' } });
}
