import 'server-only';
import { sql } from './db';
import { BookingError, quote } from './booking';
import { enqueue, sendDue, type Tx } from './notify';
import { imageType, putFile } from './storage';
import { baht, todayTH } from './thaidate';
import { checkSlip } from './slip';
import { BOOK_AHEAD_MONTHS, lastBookable, maxNights } from './rules';
import { canSee, type StaffUser } from './staff';
import type { CartItem, OrderView } from './types';

// แปลง error จากฐานข้อมูลเป็นข้อความที่ลูกค้าอ่านเข้าใจ
function dbError(e: unknown): never {
  const err = e as { code?: string; message?: string };
  if (err.code === '23P01') throw new BookingError('just_taken', 'เพิ่งมีคนจองช่วงนี้ไป เลือกใหม่อีกครั้ง');
  if (e instanceof BookingError) throw e;
  const m = err.message || '';
  if (/session_full/.test(m)) throw new BookingError('session_full', 'รอบนี้เพิ่งเต็ม เลือกรอบอื่น');
  if (/vaccine_required/.test(m)) throw new BookingError('vaccine_required', 'น้องยังไม่มีวัคซีนที่ผ่านตรวจ');
  if (/size_mismatch/.test(m)) throw new BookingError('size_mismatch', 'ขนาดน้องไม่ตรงรอบ');
  if (/session_time_mismatch/.test(m)) throw new BookingError('session_day', 'รอบนี้ไม่เปิดวันที่เลือก');
  if (/too_many_pets|pet_too_big|too_many_guests/.test(m)) throw new BookingError('over_limit', 'เกินจำนวนที่รับได้');
  const pb = /pet_busy: (.+)/.exec(m);
  if (pb) throw new BookingError('pet_busy', pb[1]);
  if (/quota_full/.test(m)) throw new BookingError('quota_full', 'ช่างรับคิวครบแล้ววันนี้ เลือกเวลาหรือวันอื่น');
  throw e;
}

async function setting(key: string, fallback: string) {
  const [r] = await sql`select value from settings where key = ${key}`;
  return r?.value ?? fallback;
}


// ---------- ตั้งเวลาเตือน (ตามแบบระบบ Google Sheet: ก่อน 1 วัน + ก่อนถึงเวลา) ----------
// ที่พัก: เย็นวันก่อน (เช็กอินพรุ่งนี้) + เช้าวันเข้า 09:00 · สระ/Grooming: เย็นวันก่อน + ก่อนเวลา X นาที
const toDate = (v: string | Date) => v instanceof Date ? v : new Date(String(v).replace(' ', 'T').replace(/\+07$/, '+07:00'));
export async function queueReminders(tx: Tx, booking: string, start: string | Date) {
  const [cfg] = await tx`select coalesce(max(value) filter (where key = 'remind_day_before'), 'on') as day,
                                coalesce(max(value) filter (where key = 'remind_day_at'), '18:00') as at,
                                coalesce(max(value) filter (where key = 'remind_soon_min'), '60') as soon
                         from settings where key in ('remind_day_before', 'remind_day_at', 'remind_soon_min')`;
  const [b] = await tx`select kind from bookings where code = ${booking}`;
  const st = toDate(start), now = Date.now();
  const ymdTH = new Date(st.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const at = /^\d{2}:\d{2}$/.test(cfg.at) ? cfg.at : '18:00';
  const plan: { t: number; when: string }[] = [];
  if (cfg.day !== 'off') plan.push({ t: new Date(`${ymdTH}T${at}:00+07:00`).getTime() - 86400000, when: 'day' });
  if (b?.kind === 'stay') {
    const morning = new Date(`${ymdTH}T09:00:00+07:00`).getTime();
    if (st.getTime() - morning >= 3 * 3600000) plan.push({ t: morning, when: 'today' });
  } else {
    const m = Number(cfg.soon);
    if (m > 0) plan.push({ t: st.getTime() - m * 60000, when: 'soon' });
  }
  for (const p of plan) if (p.t > now && p.t < st.getTime())
    await enqueue(tx, { booking, channel: 'line_push', template: 'reminder', runAfter: new Date(p.t).toISOString(), payload: { when: p.when } });
}

// ---------- สร้างการจอง (กันที่ไว้ hold_minutes นาที) ----------
// เครดิตคงเหลือ (เครดิตที่ได้รับใช้ได้ 6 เดือน · ใช้แล้วหักออก)
export async function creditBalance(customer: string): Promise<number> {
  const [r] = await sql`select coalesce(sum(amount) filter (where amount < 0 or created_at > now() - interval '6 months'), 0)::numeric as bal
                        from credits where customer_code = ${customer}`;
  return Math.max(0, Number(r.bal));
}

export async function createOrder(customer: string, items: CartItem[], acceptedPolicy: boolean, useCredit = false) {
  if (!acceptedPolicy) throw new BookingError('policy', 'กรุณาอ่านและติ๊กยอมรับเงื่อนไขการจองและยกเลิก');
  await sql`select expire_holds()`;
  const q = await quote(customer, items);               // ตรวจทุกอย่างก่อน · ชนกันจริงฐานข้อมูลกันให้อีกชั้น
  const hold = Number(await setting('hold_minutes', '30')) || 30;
  const policy = await setting('policy_version', '');
  // ใช้เครดิตหักยอดที่ต้องจ่ายตอนจอง (นับเป็นเงินที่ร้านได้รับแล้ว)
  const credit = useCredit ? Math.min(await creditBalance(customer), q.due_now) : 0;
  const free = q.due_now - credit <= 0.005;
  try {
    return await sql.begin(async (tx) => {
        const [{ code }] = await tx`select next_code('T', ${todayTH()}::date) as code`;
        await tx`insert into orders (code, customer_code, status, total, due_now, hold_until, policy_version, paid_at, paid_amount, balance_due, balance_due_by)
                 values (${code}, ${customer}, ${free ? 'paid' : 'holding'}, ${q.total}, ${q.due_now},
                         ${free ? null : tx`now() + make_interval(mins => ${hold})`}, ${policy}, ${free ? tx`now()` : null},
                         ${credit}, ${q.balance}, ${q.balance_by})`;
        if (credit > 0) {
          // ล็อกแถวเครดิตของลูกค้า กันใช้ซ้อนสองทริปพร้อมกัน
          await tx`select pg_advisory_xact_lock(hashtext('credit|' || ${customer}))`;
          const [{ bal }] = await tx`select coalesce(sum(amount) filter (where amount < 0 or created_at > now() - interval '6 months'), 0)::numeric as bal from credits where customer_code = ${customer}`;
          if (Number(bal) + 0.005 < credit) throw new BookingError('credit', 'เครดิตไม่พอ ลองใหม่อีกครั้ง');
          await tx`insert into credits (customer_code, amount, order_code, note, created_by) values (${customer}, ${-credit}, ${code}, 'ใช้เครดิตตอนจอง', 'system')`;
        }
        const codes: string[] = [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i], qi = q.items[i];
          const [{ bk }] = await tx`select next_code(b.id_prefix, (${qi.start_at}::timestamptz at time zone 'Asia/Bangkok')::date) as bk
                                    from businesses b where b.code = ${it.business}`;
          const row = {
            code: bk, order_code: code, business_code: it.business, kind: it.kind,
            unit_code: it.kind === 'stay' ? it.unit : null,
            session_code: it.kind === 'session' ? it.session : null,
            service_code: it.kind === 'slot' ? it.service : null,
            addon_codes: it.kind === 'slot' ? it.addons : [],
            staff_code: it.kind === 'slot' ? it.staff : null,
            start_at: qi.start_at, end_at: qi.end_at,
            guests: it.kind === 'stay' ? it.guests ?? null : null,
            price: qi.price, status: free ? 'confirmed' : 'holding',
          };
          await tx`insert into bookings ${tx(row)}`;
          const pets = it.kind === 'slot' ? [it.pet] : it.pets;
          for (const p of pets) await tx`insert into booking_pets (booking_code, pet_code) values (${bk}, ${p})`;
          codes.push(bk);
        }
        await enqueue(tx, { order: code, channel: 'email', template: 'new_booking' });
        // ลูกค้าได้การ์ด "รอโอน" พร้อม QR พร้อมเพย์ในแชท
        if (!free) await enqueue(tx, { order: code, channel: 'line_push', template: 'booked' });
        if (free) for (const bk of codes) await enqueue(tx, { booking: bk, channel: 'calendar', template: 'confirm' });
        if (free) {
          await enqueue(tx, { order: code, channel: 'line_push', template: 'paid' });
          if (q.balance > 0 && q.balance_by) {
            for (const d of [3, 0]) {
              const at = new Date(`${q.balance_by}T09:00:00+07:00`).getTime() - d * 86400000;
              if (at > Date.now()) await enqueue(tx, { order: code, channel: 'line_push', template: 'balance_due', runAfter: new Date(at).toISOString() });
            }
          }
          for (let i = 0; i < codes.length; i++) await queueReminders(tx, codes[i], q.items[i].start_at);
        }
        return { order: code as string, bookings: codes, due_now: q.due_now, total: q.total, paid: free, credit_used: credit };
      });
    } catch (e) {
      dbError(e);
    }
  }
  
  // ---------- ทริปของลูกค้า ----------
  export async function getOrder(customer: string, code: string): Promise<OrderView | null> {
    const [o] = await sql`
      select code, status, total, due_now, paid_amount, refund_status, refund_amount, balance_due, balance_due_by::text, change_request, to_char(hold_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as hold_until,
             (status = 'holding' and hold_until < now()) as late,
             (select json_build_object('status', p.status, 'reason', p.reject_reason) from payments p
               where p.order_code = o.code order by p.created_at desc limit 1) as last_payment
      from orders o where o.code = ${code} and o.customer_code = ${customer}`;
    if (!o) return null;
    const items = await sql`
      select k.code, k.business_code, b.name as biz, k.status, k.price,
             to_char(k.start_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as s,
             to_char(k.end_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as e,
             coalesce(u.name, sv.name, '') as item,
             coalesce((select string_agg(p.name, ', ') from booking_pets bp join pets p on p.code = bp.pet_code where bp.booking_code = k.code), '') as pets
      from bookings k join businesses b on b.code = k.business_code
      left join units u on u.code = k.unit_code left join services sv on sv.code = k.service_code
      where k.order_code = ${code} order by k.start_at`;
    return { ...o, items: [...items] } as unknown as OrderView;
  }
  
  export async function myOrders(customer: string) {
    await sql`select expire_holds()`;
    const rows = await sql`select code from orders where customer_code = ${customer} order by created_at desc limit 30`;
    return (await Promise.all(rows.map((r) => getOrder(customer, r.code)))).filter((x): x is OrderView => !!x);
  }
  
  // ---------- แนบสลิป ----------
  export async function attachSlip(customer: string, code: string, file: Buffer) {
    if (file.length > 5 * 1024 * 1024) throw new BookingError('too_big', 'รูปใหญ่เกิน 5 MB');
    const type = imageType(file);
    if (!type) throw new BookingError('not_image', 'แนบได้เฉพาะรูป JPG PNG หรือ WEBP');
    await sql`select expire_holds()`;
    const [o] = await sql`select code, status, due_now, paid_amount, balance_due, created_at, slip_dup_count, reject_count,
                                 exists (select 1 from payments where order_code = orders.code and status = 'pending') as has_pending
                          from orders where code = ${code} and customer_code = ${customer}`;
    if (!o) throw new BookingError('not_found', 'ไม่พบการจองนี้');
    if (o.status === 'expired') throw new BookingError('expired', 'หมดเวลากันที่แล้ว จองใหม่อีกครั้ง');
    // ยอดคงเหลือ (Villa) แนบได้หลังมัดจำผ่านแล้ว
    const purpose = o.status === 'paid' && Number(o.balance_due) > 0 ? 'balance' : 'deposit';
    if (purpose === 'deposit' && o.status !== 'holding') throw new BookingError('bad_status', 'การจองนี้แนบสลิปแล้ว');
    if (purpose === 'balance' && o.has_pending) throw new BookingError('bad_status', 'แนบสลิปยอดคงเหลือแล้ว รอร้านตรวจ');

    // คัดกรองก่อนรับ: ไม่ใช่สลิป / สลิปซ้ำ = ไม่รับ ไม่แจ้งร้าน (นับครั้งไว้บอกร้านตอนส่งสลิปที่ผ่าน)
    const [account, promptpay] = await Promise.all([setting('account_name', ''), setting('promptpay_id', '')]);
    const left = purpose === 'balance' ? Number(o.balance_due) : Math.round((Number(o.due_now) - Number(o.paid_amount)) * 100) / 100;
    const chk = await checkSlip(file, { due: left, createdAt: new Date(o.created_at), account, promptpay });
    if (chk.verdict !== 'review') {
      // ส่งสลิปเดิมที่ร้านกดไม่พบเงินไปแล้ว = ยกเลิกการจอง (ระบบเดิม M19.1)
      if (purpose === 'deposit' && chk.dupOf?.order === code && chk.dupOf.status === 'rejected' && chk.dupOf.kind === 'not_found') {
        const ids: number[] = [];
        await sql.begin(async (tx) => {
          await tx`update orders set status = 'cancelled', cancel_source = 'slip', hold_until = null, slip_dup_count = slip_dup_count + 1 where code = ${code} and status = 'holding'`;
          await tx`update bookings set status = 'cancelled' where order_code = ${code} and status = 'holding'`;
          await tx`select release_money(${code})`;   // คืนเครดิตที่ใช้ · เงินที่ได้บางส่วนตั้งเป็นรอโอนคืน
          ids.push(await enqueue(tx, { order: code, channel: 'line_push', template: 'cancelled', payload: { reason: 'ส่งสลิปเดิมที่ร้านไม่พบเงิน · จองใหม่และแนบหลักฐานใหม่ได้' } }));
        });
        for (const id of ids) await sendDue(1, id).catch(() => undefined);
        throw new BookingError('slip_reused', 'สลิปนี้ร้านตรวจแล้วไม่พบเงิน ระบบจึงยกเลิกการจองนี้ · จองใหม่และแนบสลิปของการโอนใหม่');
      }
      await sql`update orders set slip_dup_count = slip_dup_count + 1 where code = ${code}`;
      throw new BookingError(chk.verdict === 'duplicate' ? 'slip_duplicate' : 'not_slip', chk.message || 'แนบสลิปไม่สำเร็จ');
    }
    if (purpose === 'balance') chk.ok.push('สลิปยอดคงเหลือ (มัดจำผ่านแล้ว)');
    else if (Number(o.paid_amount) > 0) chk.flags.push(`ได้รับไปแล้ว ${baht(Number(o.paid_amount))} · ใบนี้ควรเป็นส่วนที่ขาด ${baht(left)}`);
    if (o.reject_count > 0) chk.flags.push(`สลิปของการจองนี้เคยไม่ผ่าน ${o.reject_count} ครั้ง · ไม่ผ่านอีกครั้งระบบจะยกเลิก`);
    if (o.slip_dup_count > 0) chk.flags.push(`ลูกค้าเคยส่งรูปที่ไม่ผ่าน/สลิปซ้ำ ${o.slip_dup_count} ครั้ง`);
    const ext = type.split('/')[1];
    const path = `${code}/${Date.now()}.${ext}`;
    await putFile('slips', path, file, type);
    try {
      return await sql.begin(async (tx) => {
      // ล็อกทริปไว้ กันกดแนบซ้ำพร้อมกัน
      const [cur] = await tx`select status, exists (select 1 from payments where order_code = ${code} and status = 'pending') as pend from orders where code = ${code} for update`;
      if (purpose === 'deposit' && cur.status !== 'holding') throw new BookingError('bad_status', 'การจองนี้แนบสลิปแล้ว');
      if (purpose === 'balance' && (cur.status !== 'paid' || cur.pend)) throw new BookingError('bad_status', 'แนบสลิปยอดคงเหลือแล้ว รอร้านตรวจ');
      const [{ pc }] = await tx`select next_code('PAY') as pc`;
      await tx`insert into payments (code, order_code, amount_due, slip_file, slip_ref, slip_hash, ocr_amount, checks, purpose, method)
               values (${pc}, ${code}, ${left}, ${path}, ${chk.ref}, ${chk.hash}, ${chk.amount},
                       ${tx.json({ flags: chk.flags, ok: chk.ok, ocr: chk.ocr })}, ${purpose}, 'transfer')`;
      if (purpose === 'deposit') await tx`update orders set status = 'pending_review' where code = ${code}`;
      await enqueue(tx, { order: code, channel: 'line_push', template: 'staff_new', payload: { kind: 'slip' } });
      await enqueue(tx, { order: code, channel: 'line_push', template: 'slip_received' });
      await enqueue(tx, { order: code, channel: 'email', template: 'slip_review' });
      return { payment: pc as string };
    });
  } catch (e) {
    // ส่งสลิปเดียวกันพร้อมกันสองทริป → ฐานข้อมูลกันซ้ำให้
    if ((e as { code?: string }).code === '23505' && /payments_slip_(ref|hash)/.test(String((e as { constraint_name?: string }).constraint_name ?? (e as Error).message)))
      throw new BookingError('slip_duplicate', 'สลิปนี้เคยใช้แล้ว · แนบสลิปของการโอนครั้งนี้');
    throw e;
  }
}

// ---------- พนักงานตรวจสลิป ----------
// approve = ได้เงินครบ · partial = ได้บางส่วน ขอส่วนที่ขาด · reject = ไม่ผ่าน (ครั้งที่ 2 ยกเลิกการจอง ตามระบบเดิม M19.1)
// reopen = แก้ผลที่กดไป (เฉพาะไม่ผ่าน/บางส่วน) กลับเป็นรอตรวจ
export type ReviewAction = 'approve' | 'partial' | 'reject' | 'reopen';
const MAX_REJECT = 2;
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function reviewPayment(staffUser: StaffUser, payment: string, action: ReviewAction, amountSlip: number | null, reason: string | null, rejectKind: string | null = null) {
  const staff = staffUser.code;
  const hold = Number(await setting('hold_minutes', '30')) || 30;
  const pushIds: number[] = [];
  try {
    await sql.begin(async (tx) => {
      const [p] = await tx`select p.*, o.status as order_status, o.due_now, o.reject_count, o.cancel_source
                           from payments p join orders o on o.code = p.order_code
                           where p.code = ${payment} for update of p, o`;
      if (!p) throw new BookingError('not_found', 'ไม่พบสลิปนี้');
      const biz = await tx`select distinct business_code from bookings where order_code = ${p.order_code}`;
      if (!biz.some((b) => canSee(staffUser, b.business_code))) throw new BookingError('forbidden', 'ไม่มีสิทธิ์ตรวจสลิปของธุรกิจนี้');
      const due = Number(p.due_now);
      const [{ got }] = await tx`select coalesce(sum(amount_slip), 0)::numeric as got from payments
                                 where order_code = ${p.order_code} and status = 'partial' and code <> ${payment}`;
      const before = Number(got);

      if (action === 'reopen') {
        if (!['rejected', 'partial'].includes(p.status)) throw new BookingError('bad_status', 'แก้ผลได้เฉพาะสลิปที่กดไม่ผ่านหรือรับบางส่วน');
        if (p.order_status === 'paid') throw new BookingError('bad_status', 'การจองนี้ยืนยันแล้ว');
        if (p.order_status === 'cancelled' && p.cancel_source !== 'slip') throw new BookingError('bad_status', 'การจองนี้ถูกยกเลิกด้วยเหตุอื่น แก้ผลไม่ได้');
        const [later] = await tx`select 1 from payments x where x.order_code = ${p.order_code} and x.code <> ${payment}
                                 and x.created_at > (select created_at from payments where code = ${payment}) limit 1`;
        if (later) throw new BookingError('bad_status', 'มีสลิปใหม่กว่าในการจองนี้แล้ว ตรวจสลิปใบใหม่แทน');
        // ห้อง/รอบที่ปล่อยไปแล้วอาจมีคนจองต่อ · ฐานข้อมูลกันซ้อนให้ (error = มีคนจองไปแล้ว)
        await tx`update bookings set status = 'holding' where order_code = ${p.order_code} and status in ('expired', 'cancelled')`;
        await tx`update orders set status = 'pending_review', hold_until = null, cancel_source = null,
                   reject_count = greatest(0, reject_count - ${p.status === 'rejected' ? 1 : 0}) where code = ${p.order_code}`;
        await tx`update payments set status = 'pending', reject_reason = null, reject_kind = null, reviewed_by = null, reviewed_at = null where code = ${payment}`;
        // ข้อความที่ยังไม่ได้ส่งของผลเดิม ไม่ต้องส่งแล้ว
        await tx`update notifications set status = 'sent', sent_at = now(), last_error = 'ข้าม: ร้านแก้ผลตรวจ'
                 where order_code = ${p.order_code} and status = 'queued' and template in ('slip_rejected', 'partial', 'cancelled')`;
        return;
      }

      if (p.status !== 'pending') throw new BookingError('done', 'สลิปนี้ตรวจไปแล้ว · กด "แก้ผล" ถ้าต้องการเปลี่ยน');

      if (p.purpose === 'balance') {
        // สลิปยอดคงเหลือ: ผ่าน/บางส่วน ลดยอดค้าง · ไม่ผ่าน แจ้งให้แนบใหม่ (การจองยังยืนยันอยู่)
        const owe = Number(p.amount_due);
        if (action === 'reject') {
          if (!reason) throw new BookingError('reason', 'เลือกเหตุผลที่สลิปไม่ผ่าน');
          await tx`update payments set status = 'rejected', amount_slip = ${amountSlip}, reject_reason = ${reason}, reject_kind = ${rejectKind}, reviewed_by = ${staff}, reviewed_at = now() where code = ${payment}`;
          pushIds.push(await enqueue(tx, { order: p.order_code, channel: 'line_push', template: 'balance_due', payload: { reason } }));
          return;
        }
        const amt = amountSlip ?? owe;
        if (action === 'approve' && amt + 0.005 < owe) throw new BookingError('short', `ยอดขาด ${baht(owe - amt)} · กด "ได้บางส่วน"`);
        await tx`update payments set status = ${action === 'approve' ? 'approved' : 'partial'}, amount_slip = ${amt}, reviewed_by = ${staff}, reviewed_at = now() where code = ${payment}`;
        await tx`update orders set balance_due = greatest(0, balance_due - ${amt}), paid_amount = paid_amount + ${amt} where code = ${p.order_code}`;
        if (action === 'partial') pushIds.push(await enqueue(tx, { order: p.order_code, channel: 'line_push', template: 'balance_due' }));
        else pushIds.push(await enqueue(tx, { order: p.order_code, channel: 'line_push', template: 'paid', payload: { balance: true } }));
        return;
      }
      if (p.order_status !== 'pending_review') throw new BookingError('bad_status', 'การจองนี้ไม่ได้รอตรวจสลิป');

      if (action === 'approve') {
        // วันที่จองโดนปิดหลังลูกค้าแนบสลิป → ไม่ให้ยืนยัน ให้บันทึกยอดแล้วยกเลิกพร้อมคืนเงิน
        const [cl] = await tx`select 1 from bookings k join closures c on c.business_code = k.business_code
          and (c.unit_code is null or c.unit_code = k.unit_code) and (c.session_code is null or c.session_code = k.session_code)
          and tstzrange(k.start_at, k.end_at, '[)') && tstzrange(c.date_from::timestamp at time zone 'Asia/Bangkok', (c.date_to + 1)::timestamp at time zone 'Asia/Bangkok', '[)')
          where k.order_code = ${p.order_code} and k.status not in ('cancelled', 'expired') limit 1`;
        if (cl) throw new BookingError('closed_day', 'วันที่จองร้านปิดแล้ว · กด "ได้บางส่วน" ใส่ยอดที่ได้รับ แล้วยกเลิกพร้อมคืนเงินในหน้าการจอง');
        const amt = amountSlip ?? r2(due - before);
        const total = r2(before + amt);
        if (total + 0.005 < due) throw new BookingError('short', `ยอดรวมที่ได้ ${baht(total)} ยังขาด ${baht(due - total)} · กด "ได้บางส่วน" เพื่อขอส่วนที่ขาด`);
        await tx`update payments set status = 'approved', amount_slip = ${amt}, reviewed_by = ${staff}, reviewed_at = now() where code = ${payment}`;
        await tx`update orders set status = 'paid', paid_at = now(), hold_until = null, paid_amount = ${total} where code = ${p.order_code}`;
        // ยอดคงเหลือ (Villa): เตือนก่อนครบกำหนด 3 วัน และวันครบกำหนด 09:00
        const [od] = await tx`select balance_due, balance_due_by::text as by from orders where code = ${p.order_code}`;
        if (Number(od.balance_due) > 0 && od.by) {
          for (const d of [3, 0]) {
            const at = new Date(`${od.by}T09:00:00+07:00`).getTime() - d * 86400000;
            if (at > Date.now()) await enqueue(tx, { order: p.order_code, channel: 'line_push', template: 'balance_due', runAfter: new Date(at).toISOString() });
          }
        }
        const bk = await tx`update bookings set status = 'confirmed' where order_code = ${p.order_code} and status = 'holding'
                            returning code, start_at`;
        pushIds.push(await enqueue(tx, { order: p.order_code, channel: 'line_push', template: 'paid' }));
        for (const b of bk) {
          await enqueue(tx, { booking: b.code, channel: 'calendar', template: 'confirm' });
          await queueReminders(tx, b.code, b.start_at);
        }
        return;
      }

      if (action === 'partial') {
        if (amountSlip === null || !(amountSlip > 0)) throw new BookingError('amount', 'ใส่ยอดในสลิปก่อน');
        const total = r2(before + amountSlip);
        if (total + 0.005 >= due) throw new BookingError('enough', 'ยอดครบแล้ว กด "ผ่าน" แทน');
        await tx`update payments set status = 'partial', amount_slip = ${amountSlip}, reviewed_by = ${staff}, reviewed_at = now() where code = ${payment}`;
        await tx`update orders set status = 'holding', hold_until = now() + make_interval(mins => ${hold}), paid_amount = ${total} where code = ${p.order_code}`;
        pushIds.push(await enqueue(tx, { order: p.order_code, channel: 'line_push', template: 'partial', payload: { got: total, left: r2(due - total) } }));
        return;
      }

      // ไม่ผ่าน
      if (!reason) throw new BookingError('reason', 'เลือกเหตุผลที่สลิปไม่ผ่าน');
      const n = Number(p.reject_count) + 1;
      await tx`update payments set status = 'rejected', amount_slip = ${amountSlip}, reject_reason = ${reason}, reject_kind = ${rejectKind},
                 reviewed_by = ${staff}, reviewed_at = now() where code = ${payment}`;
      if (n >= MAX_REJECT) {
        // ไม่ผ่านครั้งที่ 2 → ยกเลิก ให้จองใหม่ (ระบบเดิม M19.1)
        await tx`update orders set status = 'cancelled', reject_count = ${n}, cancel_source = 'slip', hold_until = null where code = ${p.order_code}`;
        await tx`update bookings set status = 'cancelled' where order_code = ${p.order_code} and status = 'holding'`;
        await tx`select release_money(${p.order_code})`;
        pushIds.push(await enqueue(tx, { order: p.order_code, channel: 'line_push', template: 'cancelled',
          payload: { reason: `สลิปไม่ผ่านครั้งที่ ${n} (${reason}) · จองใหม่และแนบหลักฐานใหม่ได้` } }));
      } else {
        await tx`update orders set status = 'holding', reject_count = ${n}, hold_until = now() + make_interval(mins => ${hold}) where code = ${p.order_code}`;
        pushIds.push(await enqueue(tx, { order: p.order_code, channel: 'line_push', template: 'slip_rejected',
          payload: { reason: `${reason} · แนบใหม่ได้อีก ${MAX_REJECT - n} ครั้ง` } }));
      }
    });
  } catch (e) {
    dbError(e);
  }
  // ส่ง LINE ทันที ถ้าพลาด รอบตั้งเวลาจะลองใหม่
  for (const id of pushIds) await sendDue(1, id).catch(() => undefined);
}

// ---------- งานหน้าร้าน: เช็กอิน · เริ่มทำ · เสร็จ · ไม่มา · ยกเลิก ----------
const FLOW: Record<string, Record<string, [string[], string]>> = {
  stay:    { check_in: [['confirmed'], 'checked_in'], check_out: [['checked_in'], 'done'] },
  session: { attend: [['confirmed'], 'done'] },
  slot:    { start: [['confirmed'], 'in_progress'], finish: [['in_progress'], 'done'] },
};
export async function bookingAction(staffUser: StaffUser, code: string, action: string, reason: string | null) {
  const pushIds: number[] = [];
  await sql.begin(async (tx) => {
    const [b] = await tx`select k.*, o.status as order_status from bookings k join orders o on o.code = k.order_code
                         where k.code = ${code} for update of k`;
    if (!b) throw new BookingError('not_found', 'ไม่พบการจองนี้');
    if (!canSee(staffUser, b.business_code)) throw new BookingError('forbidden', 'ไม่มีสิทธิ์ในธุรกิจนี้');
    if (action === 'cancel') {
      if (staffUser.role === 'staff') throw new BookingError('forbidden', 'ยกเลิกการจองได้เฉพาะเจ้าของหรือผู้จัดการ');
      if (!['holding', 'confirmed', 'checked_in', 'in_progress'].includes(b.status)) throw new BookingError('bad_status', 'ยกเลิกไม่ได้ในสถานะนี้');
      await tx`update bookings set status = 'cancelled' where code = ${code}`;
      // ทุกรายการในทริปยกเลิกแล้ว → ทริปยกเลิก
      await tx`update orders set status = 'cancelled' where code = ${b.order_code}
               and not exists (select 1 from bookings where order_code = ${b.order_code} and status not in ('cancelled', 'expired'))`;
      pushIds.push(await enqueue(tx, { booking: code, channel: 'line_push', template: 'cancelled', payload: { reason } }));
      if (b.calendar_event_id) await enqueue(tx, { booking: code, channel: 'calendar', template: 'cancelled' });
      return;
    }
    if (action === 'no_show') {
      if (b.status !== 'confirmed') throw new BookingError('bad_status', 'เปลี่ยนเป็นไม่มาได้เฉพาะการจองที่ยืนยันแล้ว');
      await tx`update bookings set status = 'no_show' where code = ${code}`;
      return;
    }
    const step = FLOW[b.kind]?.[action];
    if (!step) throw new BookingError('bad_action', 'คำสั่งไม่ถูกต้อง');
    if (!step[0].includes(b.status)) throw new BookingError('bad_status', 'สถานะการจองไม่ตรงขั้นตอน');
    await tx`update bookings set status = ${step[1]} where code = ${code}`;
    if (b.kind === 'slot' && action === 'finish') {
      pushIds.push(await enqueue(tx, { booking: code, channel: 'line_push', template: 'groom_done' }));
    }
  });
  for (const id of pushIds) await sendDue(1, id).catch(() => undefined);
}

// ---------- เลื่อนวัน (พนักงาน) ----------
// ราคาเดิม · ฐานข้อมูลตรวจซ้อน/รอบเต็ม/ช่างว่างให้อีกชั้น · แจ้งลูกค้า + แก้ปฏิทิน
export async function reschedule(staffUser: StaffUser, code: string, p: { date?: string; nights?: number; session?: string; time?: string; staff?: string }) {
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!p.date || !DATE.test(p.date)) throw new BookingError('bad_date', 'เลือกวันใหม่');
  const date: string = p.date;
  if (date < todayTH()) throw new BookingError('bad_date', 'เลือกวันที่ยังไม่ผ่าน');
  if (date > lastBookable(todayTH())) throw new BookingError('date_too_far', `เลื่อนได้ไม่เกิน ${BOOK_AHEAD_MONTHS} เดือนข้างหน้า`);
  const pushIds: number[] = [];
  try {
    await sql.begin(async (tx) => {
      const [b] = await tx`select k.*, bz.checkin_time, bz.checkout_time,
                                  to_char(k.start_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as old_s,
                                  extract(epoch from k.end_at - k.start_at)::int / 60 as mins
                           from bookings k join businesses bz on bz.code = k.business_code where k.code = ${code} for update of k`;
      if (!b) throw new BookingError('not_found', 'ไม่พบการจองนี้');
      if (!canSee(staffUser, b.business_code)) throw new BookingError('forbidden', 'ไม่มีสิทธิ์ในธุรกิจนี้');
      if (!['holding', 'confirmed'].includes(b.status)) throw new BookingError('bad_status', 'เลื่อนได้เฉพาะการจองที่ยังไม่เริ่มใช้บริการ');
      const hm = (s: string | null, f: string) => (/(\d{1,2}):(\d{2})/.exec(s || '')?.slice(1, 3).map((x, i) => (i ? x : x.padStart(2, '0'))).join(':')) || f;
      let start: string, end: string, session: string | null = b.session_code, staff: string | null = b.staff_code;
      if (b.kind === 'stay') {
        const n = Math.round(Number(p.nights || 0)) || Math.max(1, Math.round(Number(b.mins) / 1440));
        const [{ people }] = await tx`select max_people is not null as people from units where code = ${b.unit_code}`;
        if (n < 1 || n > maxNights(people)) throw new BookingError('bad', `จำนวนคืนต้องอยู่ระหว่าง 1–${maxNights(people)} คืน`);
        const [{ closed }] = await tx`select exists (select 1 from generate_series(${date}::date, ${date}::date + ${n - 1}::int, '1 day') d
                                        where is_closed(${b.business_code}, ${b.unit_code}, null, d::date)) as closed`;
        if (closed) throw new BookingError('closed', 'มีวันที่ร้านปิดหรือห้องปิดอยู่ในช่วงใหม่');
        const [{ to }] = await tx`select (${date}::date + ${n}::int)::text as to`;
        start = `${date} ${hm(b.checkin_time, '14:00')}+07`; end = `${to} ${hm(b.checkout_time, '12:00')}+07`;
      } else if (b.kind === 'session') {
        session = p.session || b.session_code;
        const [s] = await tx`select to_char(start_time, 'HH24:MI') as a, to_char(end_time, 'HH24:MI') as z from pool_sessions where code = ${session} and active`;
        if (!s) throw new BookingError('bad', 'ไม่พบรอบนี้');
        const [{ closed }] = await tx`select is_closed(${b.business_code}, ${b.unit_code}, ${session}, ${date}::date) as closed`;
        if (closed) throw new BookingError('closed', 'วันที่เลือกสระปิด');
        start = `${date} ${s.a}+07`; end = `${date} ${s.z}+07`;
        // ขนาดน้องต้องตรงรอบใหม่
        const [{ bad }] = await tx`select exists (select 1 from booking_pets bp join pets pt on pt.code = bp.pet_code join pool_sessions ps on ps.code = ${session}
                                     where bp.booking_code = ${code} and not pet_fits_size(pt.weight_kg, ps.size_rule)) as bad`;
        if (bad) throw new BookingError('size_mismatch', 'ขนาดน้องไม่ตรงรอบใหม่');
      } else {
        if (!p.time || !/^\d{2}:\d{2}$/.test(p.time)) throw new BookingError('bad', 'เลือกเวลาใหม่');
        staff = p.staff || b.staff_code;
        const [{ closed }] = await tx`select is_closed(${b.business_code}, null, null, ${date}::date) as closed`;
        if (closed) throw new BookingError('closed', 'วันที่เลือกร้านปิด');
        const [w] = await tx`select ${p.time}::time >= work_start and (${p.time}::time + make_interval(mins => ${b.mins})) <= work_end
                                    and extract(isodow from ${date}::date)::int = any (work_days) as ok
                             from staff where code = ${staff} and is_groomer`;
        if (!w?.ok) throw new BookingError('staff_off', 'ช่างไม่ได้ทำงานเวลานั้น');
        start = `${date} ${p.time}+07`;
        const [{ e }] = await tx`select to_char((${start}::timestamptz + make_interval(mins => ${b.mins})) at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') || '+07' as e`;
        end = e;
      }
      // วัคซีนต้องใช้ได้ถึงวันใหม่ (ธุรกิจที่ต้องใช้วัคซีน)
      const [vx] = await tx`select string_agg(pt.name, ', ') as names from booking_pets bp join pets pt on pt.code = bp.pet_code
                            join businesses bz on bz.code = ${b.business_code}
                            where bp.booking_code = ${code} and bz.need_vaccine
                              and coalesce((select max(v.expires_on) from pet_vaccines v where v.pet_code = pt.code and v.status = 'approved'), '1900-01-01') < ${date}::date`;
      if (vx?.names) throw new BookingError('vaccine_required', `${vx.names} วัคซีนหมดอายุก่อนวันใหม่`);
      await tx`update bookings set start_at = ${start}::timestamptz, end_at = ${end}::timestamptz, session_code = ${session}, staff_code = ${staff} where code = ${code}`;
      // การเตือนเดิมยกเลิก ตั้งใหม่ตามวันใหม่
      await tx`update notifications set status = 'sent', last_error = 'ข้าม: เลื่อนวันแล้ว', sent_at = now()
               where booking_code = ${code} and template = 'reminder' and status = 'queued'`;
      if (b.status === 'confirmed') await queueReminders(tx, code, start);
      pushIds.push(await enqueue(tx, { booking: code, channel: 'line_push', template: 'rescheduled', payload: { old: b.old_s } }));
      if (b.calendar_event_id) await enqueue(tx, { booking: code, channel: 'calendar', template: 'rescheduled' });
    });
  } catch (e) {
    dbError(e);
  }
  for (const id of pushIds) await sendDue(1, id).catch(() => undefined);
}
