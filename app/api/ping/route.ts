import { NextRequest } from 'next/server';
import { dbPort, sql } from '@/lib/db';
import { getBizCatalog, getCatalog, getPets } from '@/lib/catalog';
import { me } from '@/lib/me';
import { liffId } from '@/lib/config';
import { oaId } from '@/lib/line';
import { readdirSync } from 'node:fs';
import path from 'node:path';

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
    db_port: dbPort,
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
    // migration ที่ยังไม่ได้รันบนฐานข้อมูลนี้ (ถ้ามี = build ข้าม migrate · โค้ดใหม่จะพัง)
    try {
      const files = readdirSync(path.join(process.cwd(), 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'));
      const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name as string));
      out.migrations_missing = files.filter((f) => !done.has(f));
    } catch (e) { out.migrations_missing = `ตรวจไม่ได้: ${(e as Error).message}`; }
    const [pp] = await sql`select value from settings where key = 'promptpay_id'`;
    out.promptpay_set = !!String(pp?.value ?? '').replace(/\D/g, '');   // QR ขึ้นได้ต่อเมื่อเป็น true
    out.line_oa_id = await oaId().catch(() => null);                    // ใช้เปิดแชทพร้อมข้อความ
    out.demo_mode = process.env.DEMO_MODE === '1' && !process.env.NEXT_PUBLIC_LIFF_ID;
    out.env = Object.fromEntries(['NEXT_PUBLIC_LIFF_ID', 'LINE_LOGIN_CHANNEL_ID', 'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET', 'SESSION_SECRET', 'CRON_SECRET', 'NEXT_PUBLIC_SUPABASE_URL']
      .map((k) => [k, !!process.env[k]]));
  }
  out.total_ms = Date.now() - t0;
  return Response.json(out, { headers: { 'cache-control': 'no-store' } });
}
