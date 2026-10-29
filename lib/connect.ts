import 'server-only';
import { sql } from './db';

// สถานะบริการนอกที่ต้องใช้ key (แสดงแค่ "ใส่แล้ว/ยังไม่ใส่" · ไม่แสดงค่า key เด็ดขาด)
// key ทุกตัวอยู่ใน Vercel → Settings → Environment Variables เท่านั้น ห้ามเก็บในฐานข้อมูล
export type Svc = { name: string; what: string; env: string[]; ready: boolean; missing: string[]; without: string };

const has = (k: string) => !!process.env[k]?.trim();

export async function services(): Promise<Svc[]> {
  const [liff] = await sql`select value from settings where key = 'liff_id'`;
  const cals = await sql`select count(*)::int as n from businesses where active and calendar_id is not null and calendar_id <> ''`;
  const list: Omit<Svc, 'ready' | 'missing'>[] = [
    { name: 'LINE ส่งข้อความ', what: 'ส่งการ์ดยืนยัน เตือนนัด ผลสลิป ให้ลูกค้าในแชท', env: ['LINE_CHANNEL_ACCESS_TOKEN'],
      without: 'ไม่ส่งข้อความ LINE (ข้อความค้างในคิว ส่งให้เองเมื่อใส่ key)' },
    { name: 'LINE ตอบรหัสการจอง (webhook)', what: 'ลูกค้าส่งรหัสการจองเข้าแชท แล้วได้การ์ดสถานะกลับ (reply ไม่ใช้โควตา)', env: ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN'],
      without: 'ส่งรหัสเข้าแชทแล้วไม่มีการ์ดตอบ · ตั้ง Webhook URL เป็น <โดเมน>/api/line/webhook' },
    { name: 'LINE ล็อกอิน (LIFF)', what: 'ลูกค้าเปิดหน้าจองใน LINE แล้วล็อกอินอัตโนมัติ', env: [],
      without: 'เปิดหน้าจองนอก LINE ได้แต่จองไม่ได้ (ยกเว้นโหมดเดโม่)' },
    { name: 'อีเมลแจ้งร้าน (Resend)', what: 'อีเมลแจ้งจองใหม่ สลิปรอตรวจ คำขอลบข้อมูล', env: ['EMAIL_API_KEY', 'EMAIL_FROM'],
      without: 'ร้านต้องเปิดหลังบ้านดูเอง' },
    { name: 'Google Calendar', what: 'ลงนัดในปฏิทินของแต่ละธุรกิจ', env: ['GOOGLE_SERVICE_ACCOUNT_JSON'],
      without: 'ไม่ลงปฏิทิน (ดูในหลังบ้านแทน)' },
    { name: 'อ่านสลิป (Google Vision)', what: 'อ่านยอด ผู้รับ วันที่ในสลิป · ฟรี 1,000 รูป/เดือน', env: ['GOOGLE_VISION_API_KEY'],
      without: 'ยังกันรูปที่ไม่ใช่สลิปและสลิปซ้ำได้จาก QR · พนักงานอ่านยอดเอง' },
    { name: 'เก็บรูป (Supabase Storage)', what: 'เก็บรูปสลิป รูปวัคซีน รูปห้อง', env: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
      without: 'เก็บรูปไว้ชั่วคราวบนเซิร์ฟเวอร์ (หายเมื่อ deploy ใหม่) · ต้องใส่ก่อนใช้จริง' },
  ];
  return list.map((s) => {
    let missing = s.env.filter((k) => !has(k));
    if (s.name.startsWith('LINE ล็อกอิน') && !has('NEXT_PUBLIC_LIFF_ID') && !liff?.value) missing = ['LIFF ID (ใส่ในหน้ารับเงินและข้อมูลร้าน)'];
    if (s.name === 'Google Calendar' && !missing.length && !cals[0].n) missing = ['รหัสปฏิทินของธุรกิจ (businesses.calendar_id)'];
    return { ...s, ready: !missing.length, missing };
  });
}
