import { NextRequest, NextResponse, after } from 'next/server';
import { sql } from '@/lib/db';
import { enqueue, sendDue } from '@/lib/notify';
import { currentCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST { kind: 'cancel' | 'reschedule', note } · ลูกค้าส่งคำขอ ร้านเป็นคนดำเนินการ
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  after(() => sendDue(10).catch(() => undefined));
  const c = await currentCustomer();
  if (!c) return NextResponse.json({ message: 'เปิดหน้านี้ผ่าน LINE ของร้าน' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { kind?: string; note?: string };
  const kind = b.kind === 'cancel' ? 'ขอยกเลิก' : b.kind === 'reschedule' ? 'ขอเลื่อนวัน' : null;
  if (!kind) return NextResponse.json({ message: 'เลือกคำขอ' }, { status: 400 });
  const note = String(b.note ?? '').trim().slice(0, 200);
  const code = (await params).code;
  const done = await sql.begin(async (tx) => {
    const [o] = await tx`update orders set change_request = ${kind + (note ? ' · ' + note : '')}, change_request_at = now()
                         where code = ${code} and customer_code = ${c} and status in ('paid', 'pending_review', 'holding') returning code`;
    if (!o) return false;
    await enqueue(tx, { order: code, channel: 'email', template: 'staff_new', payload: { kind: 'request', text: kind + (note ? ' · ' + note : '') } });
    await enqueue(tx, { order: code, channel: 'line_push', template: 'staff_new', payload: { kind: 'request', text: kind + (note ? ' · ' + note : '') } });
    return true;
  });
  if (!done) return NextResponse.json({ message: 'ส่งคำขอไม่ได้ การจองนี้ไม่อยู่ในสถานะที่แก้ได้' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
