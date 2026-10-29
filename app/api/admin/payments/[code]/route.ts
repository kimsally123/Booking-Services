import { NextRequest, NextResponse, after } from 'next/server';
import { sendDue } from '@/lib/notify';
import { BookingError } from '@/lib/booking';
import { fail } from '@/lib/api';
import { reviewPayment } from '@/lib/orders';
import { currentStaff } from '@/lib/staff';

export const dynamic = 'force-dynamic';

// POST { action: 'approve' | 'partial' | 'reject' | 'reopen', amount_slip?, reason?, reject_kind? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  // ส่งอีเมล/ปฏิทิน/LINE ที่ค้างหลังตอบลูกค้าแล้ว (ไม่ทำให้หน้าเว็บช้า)
  after(() => sendDue(10).catch(() => undefined));
  try {
    const s = await currentStaff();
    if (!s) return NextResponse.json({ error: 'no_login', message: 'เข้าสู่ระบบพนักงานก่อน' }, { status: 401 });
    const b = (await req.json().catch(() => null)) as { action?: string; amount_slip?: number; reason?: string; reject_kind?: string } | null;
    const ACT = ['approve', 'partial', 'reject', 'reopen'] as const;
    if (!b || !ACT.includes(b.action as never)) throw new BookingError('bad_action', 'คำสั่งไม่ถูกต้อง');
    const amt = b.amount_slip === undefined || b.amount_slip === null ? null : Number(b.amount_slip);
    if (amt !== null && !(amt >= 0)) throw new BookingError('bad_amount', 'ยอดในสลิปไม่ถูกต้อง');
    const kind = ['not_found', 'wrong_order', 'other'].includes(String(b.reject_kind)) ? String(b.reject_kind) : null;
    await reviewPayment(s, (await params).code, b.action as (typeof ACT)[number], amt, b.reason?.slice(0, 200) || null, kind);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
