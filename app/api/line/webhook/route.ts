import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from '@/lib/db';
import { replyMessage } from '@/lib/line';
import { statusMessage } from '@/lib/notify';
import { appLink } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Webhook ของ LINE OA: ตอบเฉพาะข้อความที่มีรหัสการจอง หรือคำว่า "สถานะการจอง" / "การจองของฉัน"
// ข้อความอื่นปล่อยให้แชทร้านและข้อความตอบกลับอัตโนมัติใน OA Manager จัดการ · ตอบด้วย reply (ไม่ใช้โควตา)
const CODE = /\bT-\d{6}-\d{2,}\b/i;
const LIST = /^(สถานะการจอง|การจองของฉัน|เช็กการจอง|เช็คการจอง)$/;

function signed(body: string, sig: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !sig) return false;
  const a = Buffer.from(createHmac('sha256', secret).update(body).digest('base64')), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Ev = { type: string; replyToken?: string; source?: { type: string; userId?: string }; message?: { type: string; text?: string }; deliveryContext?: { isRedelivery?: boolean } };

export async function POST(req: NextRequest) {
  const raw = await req.text();
  // ยังไม่ใส่ LINE_CHANNEL_SECRET: ตอบ 200 ให้กด Verify ผ่าน แต่ไม่ทำอะไร (ตอบการ์ดไม่ได้จนกว่าจะใส่)
  if (!process.env.LINE_CHANNEL_SECRET) { console.warn('webhook: ยังไม่ได้ตั้ง LINE_CHANNEL_SECRET'); return NextResponse.json({ ok: false, reason: 'no_secret' }); }
  if (!signed(raw, req.headers.get('x-line-signature'))) return new NextResponse('bad signature', { status: 401 });
  const events = ((JSON.parse(raw || '{}').events ?? []) as Ev[]);
  for (const e of events) {
    try {
      if (e.type !== 'message' || e.message?.type !== 'text' || !e.replyToken || e.deliveryContext?.isRedelivery) continue;
      if (e.source?.type !== 'user' || !e.source.userId) continue;
      const text = (e.message.text ?? '').trim();
      const code = CODE.exec(text)?.[0]?.toUpperCase();
      const list = LIST.test(text);
      if (!code && !list) continue;
      const [c] = await sql`select code from customers where line_user_id = ${e.source.userId}`;
      if (!c) {
        const url = await appLink('/me');
        await replyMessage(e.replyToken, [{ type: 'text', text: `ยังไม่พบบัญชีของคุณ · กด "การจองของฉัน" ในเมนูเพื่อเข้าสู่ระบบก่อน${url ? '\n' + url : ''}` }]);
        continue;
      }
      // รหัสต้องเป็นการจองของคนที่ส่งเท่านั้น
      const codes = code
        ? (await sql`select code from orders where code = ${code} and customer_code = ${c.code}`).map((r) => r.code as string)
        : (await sql`select code from orders where customer_code = ${c.code} and status in ('holding', 'pending_review', 'paid')
                     and exists (select 1 from bookings k where k.order_code = orders.code and k.end_at > now() and k.status not in ('cancelled', 'expired'))
                     order by created_at desc limit 5`).map((r) => r.code as string);
      if (!codes.length) {
        await replyMessage(e.replyToken, [{ type: 'text', text: code ? `ไม่พบการจอง ${code} ในบัญชีนี้` : 'ตอนนี้ยังไม่มีการจองที่กำลังจะถึง' }]);
        continue;
      }
      const msgs = (await Promise.all(codes.map(statusMessage))).filter(Boolean) as Record<string, unknown>[];
      await replyMessage(e.replyToken, msgs.length > 1
        ? [{ type: 'flex', altText: `การจองของคุณ ${msgs.length} รายการ`, contents: { type: 'carousel', contents: msgs.map((m) => m.contents) } }]
        : msgs);
    } catch (err) {
      console.error('webhook', (err as Error).message);
    }
  }
  return NextResponse.json({ ok: true });
}

// เปิดลิงก์ในเบราว์เซอร์เพื่อเช็กว่า deploy แล้ว
export async function GET() {
  return NextResponse.json({ ok: true, webhook: 'line', secret: !!process.env.LINE_CHANNEL_SECRET });
}
