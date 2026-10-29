import 'server-only';
import postgres from 'postgres';

// ต่อฐานข้อมูลจากฝั่ง server เท่านั้น
// บน Vercel ใช้ Supabase pooler (transaction mode, port 6543) → ต้องปิด prepare
const url = process.env.SUPABASE_DB_URL;

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

function make() {
  if (!url) throw new Error('ยังไม่ได้ตั้ง SUPABASE_DB_URL');
  return postgres(url, {
    prepare: false,
    // 1 connection ต่อ instance: บน Supabase pooler การเปิดหลาย connection พร้อมกันค้าง (เจอจริงบน Vercel)
    // คำสั่งที่ยิงพร้อมกัน (Promise.all) จะต่อคิวใน connection เดียว ยังเร็วเพราะแต่ละคำสั่ง ~2 ms
    max: 1,
    // serverless: ปิด connection ที่ว่างเร็ว ๆ และไม่ใช้ตัวเก่านานเกิน กันค้างกับ socket ที่ pooler ตัดไปแล้ว
    idle_timeout: 5,
    max_lifetime: 60,
    connect_timeout: 10,
    connection: { TimeZone: 'Asia/Bangkok' },
    types: { numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
  });
}

// ใช้ตัวเดิมตอน dev (hot reload) ไม่ให้เปิด connection ใหม่ทุกครั้ง
export const sql = globalThis.__sql ?? make();
if (process.env.NODE_ENV !== 'production') globalThis.__sql = sql;
