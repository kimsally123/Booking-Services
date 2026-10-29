import 'server-only';
import { sql } from './db';
import { BookingError } from './booking';
import { enqueue, sendDue } from './notify';
import { canSee, type StaffUser } from './staff';
import { daysBetween, todayTH } from './thaidate';

// เงื่อนไขยกเลิก: businesses.cancel_rules = [{days, refund%}] เรียงจากมากไปน้อย
// ยกเลิกล่วงหน้า ≥ days วัน → คืน refund% ของเงินที่จ่ายแล้ว (ส่วนของรายการนั้น) · คืนเป็นเครดิตเป็นค่าเริ่ม
export type RefundMode = 'credit' | 'refund' | 'forfeit';
type Rule = { days: number; refund: number };

export async function suggestRefund(order: string, codes: string[]) {
  const [o] = await sql`select total, paid_amount, refund_amount from orders where code = ${order}`;
  if (!o) throw new BookingError('not_found', 'ไม่พบการจอง');
  const rows = await sql`select k.code, k.price, b.name, b.cancel_rules, (k.start_at at time zone 'Asia/Bangkok')::date::text as d
                         from bookings k join businesses b on b.code = k.business_code where k.order_code = ${order} and k.code in ${sql(codes)}`;
  const paid = Number(o.paid_amount) - Number(o.refund_amount);
  const total = Number(o.total) || 1;
  const lines = rows.map((r) => {
    const days = daysBetween(todayTH(), r.d);
    const rules = ((r.cancel_rules ?? []) as Rule[]).slice().sort((a, b) => b.days - a.days);
    const hit = rules.find((x) => days >= x.days);
    const pct = hit ? hit.refund : 0;
    const share = (paid * Number(r.price)) / total;          // เงินที่จ่ายแล้วส่วนของรายการนี้
    return { code: r.code as string, name: r.name as string, days, pct, amount: Math.round((share * pct) / 100) };
  });
  const amount = Math.max(0, Math.min(paid, lines.reduce((a, l) => a + l.amount, 0)));
  return { paid: Math.max(0, paid), amount, lines };
}

// พนักงานยกเลิกพร้อมบันทึกการคืนเงิน: เครดิต (เข้าบัญชีลูกค้าทันที) · โอนคืน (รอโอน) · ไม่คืน
export async function cancelWithRefund(s: StaffUser, order: string, codes: string[], mode: RefundMode, amount: number, reason: string | null, source = 'staff') {
  if (s.role === 'staff') throw new BookingError('forbidden', 'ยกเลิกการจองได้เฉพาะเจ้าของหรือผู้จัดการ');
  if (!codes.length) throw new BookingError('bad', 'เลือกรายการที่จะยกเลิก');
  const ids: number[] = [];
  await sql.begin(async (tx) => {
    const [o] = await tx`select o.*, c.code as customer from orders o join customers c on c.code = o.customer_code where o.code = ${order} for update of o`;
    if (!o) throw new BookingError('not_found', 'ไม่พบการจอง');
    const bk = await tx`select code, business_code, status, calendar_event_id from bookings where order_code = ${order} and code in ${tx(codes)} for update`;
    if (bk.length !== codes.length) throw new BookingError('bad', 'รายการไม่ตรงกับการจองนี้');
    for (const b of bk) {
      if (!canSee(s, b.business_code)) throw new BookingError('forbidden', 'ไม่มีสิทธิ์ในธุรกิจนี้');
      if (!['holding', 'confirmed', 'checked_in', 'in_progress'].includes(b.status)) throw new BookingError('bad_status', `${b.code} ยกเลิกไม่ได้ในสถานะนี้`);
    }
    const paid = Number(o.paid_amount) - Number(o.refund_amount);
    const amt = mode === 'forfeit' ? 0 : Math.round(Math.max(0, Math.min(amount, paid)) * 100) / 100;
    await tx`update bookings set status = 'cancelled' where code in ${tx(codes)}`;
    // ยกเลิกครบทุกรายการ → ทริปยกเลิก
    await tx`update orders set status = 'cancelled', cancel_source = ${source}, hold_until = null where code = ${order}
             and not exists (select 1 from bookings where order_code = ${order} and status not in ('cancelled', 'expired'))`;
    // เตือนที่ค้างของรายการที่ยกเลิก ไม่ต้องส่ง
    await tx`update notifications set status = 'sent', sent_at = now(), last_error = 'ข้าม: ยกเลิกแล้ว'
             where booking_code in ${tx(codes)} and status = 'queued' and template = 'reminder'`;
    if (paid > 0) {
      const st = mode === 'credit' ? 'credited' : mode === 'refund' ? (amt > 0 ? 'pending' : 'forfeited') : 'forfeited';
      await tx`update orders set refund_status = ${st}, refund_amount = refund_amount + ${amt} where code = ${order}`;
      if (mode === 'credit' && amt > 0) {
        await tx`insert into credits (customer_code, amount, order_code, note, created_by)
                 values (${o.customer}, ${amt}, ${order}, ${'คืนเครดิตจากการยกเลิก' + (reason ? ' · ' + reason : '')}, ${s.code})`;
      }
      // ยกเลิกฝั่งร้าน (ร้านปิด ฯลฯ) ควรคืนเต็ม · แจ้งยอดที่คืนในข้อความเดียว
      ids.push(await enqueue(tx, { order, channel: 'line_push', template: 'refund' }));
    }
    ids.push(await enqueue(tx, { order, channel: 'line_push', template: 'cancelled', payload: { reason, codes } }));
    for (const b of bk) if (b.calendar_event_id) await enqueue(tx, { booking: b.code, channel: 'calendar', template: 'cancelled' });
  });
  for (const id of ids) await sendDue(1, id).catch(() => undefined);
}

// โอนคืนเสร็จแล้ว (รายการที่รอโอน)
export async function markRefunded(s: StaffUser, order: string) {
  if (s.role === 'staff') throw new BookingError('forbidden', 'เฉพาะเจ้าของหรือผู้จัดการ');
  const ids: number[] = [];
  await sql.begin(async (tx) => {
    const [o] = await tx`update orders set refund_status = 'refunded' where code = ${order} and refund_status = 'pending' returning code`;
    if (!o) throw new BookingError('bad_status', 'ไม่มีรายการรอโอนคืน');
    ids.push(await enqueue(tx, { order, channel: 'line_push', template: 'refund' }));
  });
  for (const id of ids) await sendDue(1, id).catch(() => undefined);
}

// รับเงินส่วนที่เหลือที่ร้าน (เงินสด/โอน) · บันทึกเป็นรายการชำระ · ลดยอดค้างออนไลน์ด้วยถ้ามี
export async function collectAtShop(s: StaffUser, order: string, amount: number, method: 'cash' | 'transfer') {
  if (!(amount > 0)) throw new BookingError('amount', 'ใส่ยอดที่รับ');
  await sql.begin(async (tx) => {
    const [o] = await tx`select code, status, total, paid_amount from orders where code = ${order} for update`;
    if (!o) throw new BookingError('not_found', 'ไม่พบการจอง');
    if (o.status !== 'paid') throw new BookingError('bad_status', 'รับเงินที่ร้านได้หลังยืนยันการจองแล้ว');
    const biz = await tx`select distinct business_code from bookings where order_code = ${order}`;
    if (!biz.some((b) => canSee(s, b.business_code))) throw new BookingError('forbidden', 'ไม่มีสิทธิ์ในธุรกิจนี้');
    const owe = Number(o.total) - Number(o.paid_amount);
    if (amount - 0.005 > owe) throw new BookingError('over', `ยอดค้างเหลือ ${owe.toLocaleString('en-US')} บาท`);
    const [{ pc }] = await tx`select next_code('PAY') as pc`;
    await tx`insert into payments (code, order_code, amount_due, amount_slip, status, purpose, method, reviewed_by, reviewed_at)
             values (${pc}, ${order}, ${owe}, ${amount}, 'approved', 'shop', ${method}, ${s.code}, now())`;
    await tx`update orders set paid_amount = paid_amount + ${amount}, balance_due = greatest(0, balance_due - ${amount}) where code = ${order}`;
  });
}
