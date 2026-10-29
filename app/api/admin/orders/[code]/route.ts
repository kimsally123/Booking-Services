import { NextRequest, NextResponse, after } from 'next/server';
import { sendDue } from '@/lib/notify';
import { BookingError } from '@/lib/booking';
import { fail } from '@/lib/api';
import { currentStaff } from '@/lib/staff';
import { cancelWithRefund, collectAtShop, markRefunded, suggestRefund, type RefundMode } from '@/lib/refund';

export const dynamic = 'force-dynamic';

// GET ?codes=a,b → ยอดคืนที่แนะนำตามเงื่อนไขยกเลิก
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    if (!(await currentStaff())) return NextResponse.json({ message: 'เข้าสู่ระบบพนักงานก่อน' }, { status: 401 });
    const codes = (req.nextUrl.searchParams.get('codes') || '').split(',').filter((x) => /^[A-Z]{1,3}-\d{6}-\d{2,}$/.test(x));
    return NextResponse.json(await suggestRefund((await params).code, codes));
  } catch (e) { return fail(e); }
}

// POST { action: 'cancel', codes, refund: 'credit'|'refund'|'forfeit', amount, reason } · { action: 'refunded' } · { action: 'collect', amount, method }
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  after(() => sendDue(10).catch(() => undefined));
  try {
    const s = await currentStaff();
    if (!s) return NextResponse.json({ message: 'เข้าสู่ระบบพนักงานก่อน' }, { status: 401 });
    const b = (await req.json().catch(() => ({}))) as { action?: string; codes?: string[]; refund?: string; amount?: number; reason?: string; source?: string };
    const code = (await params).code;
    if (b.action === 'refunded') { await markRefunded(s, code); return NextResponse.json({ ok: true }); }
    if (b.action === 'collect') {
      const m = (b as { method?: string }).method === 'cash' ? 'cash' : 'transfer';
      await collectAtShop(s, code, Number(b.amount) || 0, m);
      return NextResponse.json({ ok: true });
    }
    if (b.action !== 'cancel') throw new BookingError('bad_action', 'คำสั่งไม่ถูกต้อง');
    const mode = (['credit', 'refund', 'forfeit'].includes(String(b.refund)) ? b.refund : 'credit') as RefundMode;
    await cancelWithRefund(s, code, (b.codes ?? []).map(String).slice(0, 20), mode, Number(b.amount) || 0, b.reason?.slice(0, 200) || null,
      b.source === 'closed' ? 'closed' : 'staff');
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
