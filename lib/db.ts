import 'server-only';
import postgres from 'postgres';

// ต่อฐานข้อมูลจากฝั่ง server เท่านั้น
// Supabase pooler แบบ transaction (port 6543) ค้างเมื่อยิงหลายคำสั่งพร้อมกันใน connection เดียว (pipelining)
// → ใช้แบบ session (port 5432 ที่อยู่เดียวกัน) แทนเสมอ · ตั้ง DB_ALLOW_6543=1 ถ้าอยากใช้ 6543 จริง ๆ
const raw = process.env.SUPABASE_DB_URL;
const url = raw && process.env.DB_ALLOW_6543 !== '1' && /pooler\.supabase\.com:6543\//.test(raw)
  ? raw.replace(':6543/', ':5432/') : raw;

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

function make() {
  if (!url) throw new Error('ยังไม่ได้ตั้ง SUPABASE_DB_URL');
  return postgres(url, {
    prepare: false,
    // session mode จำกัดจำนวน connection ทั้งโปรเจกต์ → ใช้น้อย ๆ ต่อ instance และปิดเร็วเมื่อว่าง
    max: 2,
    // serverless: ปิด connection ที่ว่างเร็ว ๆ และไม่ใช้ตัวเก่านานเกิน กันค้างกับ socket ที่ pooler ตัดไปแล้ว
    idle_timeout: 5,
    max_lifetime: 60,
    connect_timeout: 10,
    connection: { TimeZone: 'Asia/Bangkok' },
    types: { numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
  });
}

// ใช้ตัวเดิมตอน dev (hot reload) ไม่ให้เปิด connection ใหม่ทุกครั้ง
export const dbPort = url ? (/:(\d+)\//.exec(url)?.[1] ?? '') : '';
export const sql = globalThis.__sql ?? make();
if (process.env.NODE_ENV !== 'production') globalThis.__sql = sql;
