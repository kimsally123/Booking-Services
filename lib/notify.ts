import 'server-only';
import { amountDue, hasPromptPay, qrUrl } from './qrlink';
import type { TransactionSql } from 'postgres';
import { sql } from './db';
import { pushMessage, type LineMessage } from './line';
import { emailReady, sendEmail } from './email';
import { calendarReady, deleteEvent, eventId, insertEvent, patchEvent } from './gcal';
import { baht, thDate } from './thaidate';
import { flexCard, type Card } from './flex';
import { appLink } from './config';

export type Tx = TransactionSql<{}>;
export type Template = 'paid' | 'slip_rejected' | 'reminder' | 'new_booking' | 'slip_review' | 'cancelled' | 'groom_done' | 'confirm'
  | 'vaccine_ok' | 'vaccine_rejected' | 'vaccine_review' | 'delete_request' | 'rescheduled'
  | 'partial' | 'balance_due' | 'refund' | 'closed_day' | 'staff_new' | 'booked' | 'slip_received';
type Channel = 'line_push' | 'email' | 'calendar';

// ใส่คิว (ในธุรกรรมเดียวกับการเปลี่ยนสถานะ) · ส่งจริงทีหลัง ส่งพลาดลองใหม่ได้
export async function enqueue(tx: Tx, n: { order?: string; booking?: string; pet?: string; channel: Channel; template: Template; payload?: object; runAfter?: string; toCustomer?: boolean }) {
  const [r] = await tx`
    insert into notifications (order_code, booking_code, pet_code, channel, template, payload, run_after, to_customer)
    values (${n.order ?? null}, ${n.booking ?? null}, ${n.pet ?? null}, ${n.channel}, ${n.template},
            ${tx.json((n.payload ?? {}) as never)}, coalesce(${n.runAfter ?? null}::timestamptz, now()), ${n.toCustomer ?? false})
    returning id`;
  // ลูกค้าที่กรอกอีเมล ได้สำเนาทางอีเมลด้วย (ไม่มีอีเมล = ข้ามตอนส่ง)
  if (n.channel === 'line_push' && EMAIL_COPY.includes(n.template)) {
    await tx`insert into notifications (order_code, booking_code, channel, template, payload, run_after, to_customer)
             values (${n.order ?? null}, ${n.booking ?? null}, 'email', ${n.template}, ${tx.json((n.payload ?? {}) as never)},
                     coalesce(${n.runAfter ?? null}::timestamptz, now()), true)`;
  }
  return r.id as number;
}
const EMAIL_COPY: Template[] = ['paid', 'cancelled', 'rescheduled', 'reminder', 'refund'];

type Job = { id: number; order_code: string | null; booking_code: string | null; pet_code: string | null; customer_code: string | null; channel: Channel; template: Template; payload: Record<string, unknown>; to_customer: boolean; tries: number };

// รายการจองที่เกี่ยวกับงานนี้
async function bookingsOf(j: Job) {
  return sql`
    select k.code, k.order_code, k.business_code, b.name as biz, b.color, b.booking_type, b.calendar_id, k.status, k.calendar_event_id, k.price,
           coalesce(u.name, sv.name, '') as item, c.display_name as customer, c.phone,
           to_char(k.start_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD') as d, to_char(k.start_at at time zone 'Asia/Bangkok', 'HH24:MI') as t,
           to_char(k.start_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS') as s_iso,
           to_char(k.end_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS') as e_iso,
           coalesce((select string_agg(p.name, ', ') from booking_pets bp join pets p on p.code = bp.pet_code where bp.booking_code = k.code), '') as pets
    from bookings k join businesses b on b.code = k.business_code join orders o on o.code = k.order_code
    join customers c on c.code = o.customer_code
    left join units u on u.code = k.unit_code left join services sv on sv.code = k.service_code
    where (${j.order_code}::text is not null and k.order_code = ${j.order_code}) or k.code = ${j.booking_code}
    order by k.start_at`;
}

async function shopName() {
  const [r] = await sql`select value from settings where key = 'shop_name'`;
  return r?.value ?? 'ร้าน';
}

// ร้านปิดข้อความบางแบบได้ที่ ตั้งค่า → ข้อความ LINE
const MSG_KEY: Partial<Record<Template, string>> = {
  booked: 'msg_booked', slip_received: 'msg_slip_received', paid: 'msg_paid', reminder: 'msg_reminder', slip_rejected: 'msg_slip_rejected', groom_done: 'msg_groom_done',
  cancelled: 'msg_cancelled', vaccine_ok: 'msg_vaccine', vaccine_rejected: 'msg_vaccine', rescheduled: 'msg_rescheduled',
};
async function lineFor(j: Job, forEmail = false): Promise<{ to: string; text: string; card?: Card } | 'skip'> {
  const key = MSG_KEY[j.template];
  if (key) { const [o] = await sql`select value from settings where key = ${key}`; if (o?.value === 'off') return 'skip'; }
  const name = await shopName();
  if (j.pet_code) {
    const [p] = await sql`select p.code, p.name, c.line_user_id from pets p join customers c on c.code = p.customer_code where p.code = ${j.pet_code}`;
    if (!p?.line_user_id) throw new Error('ลูกค้าไม่มี LINE userId');
    const ok = j.template === 'vaccine_ok';
    const text = ok ? `${name}: วัคซีนของ${p.name}ผ่านการตรวจแล้ว ✅ จองสระและ Pet hotel ได้เลย`
                    : `${name}: วัคซีนของ${p.name}ยังไม่ผ่าน — ${j.payload.reason ?? ''}\nส่งรูปใหม่ได้ที่เมนู "น้องของฉัน"`;
    const url = await appLink(ok ? '/' : `/me/pets/${p.code}`);
    return { to: p.line_user_id, text, card: {
      head: `${name} · สมุดวัคซีน`, headColor: ok ? '#1E7B4A' : '#B8262E',
      title: ok ? `วัคซีนของ${p.name}ผ่านแล้ว` : `วัคซีนของ${p.name}ยังไม่ผ่าน`,
      body: ok ? 'จองสระและ Pet hotel ได้เลย' : `${j.payload.reason ?? ''} · ส่งรูปใหม่ได้`,
      button: url ? { label: ok ? 'จองบริการ' : 'ส่งรูปใหม่', url } : undefined } };
  }
  // ข้อความทั่วไปไม่แสดงรายการที่ยกเลิก/หมดเวลาแล้ว (ยกเว้นแจ้งยกเลิก)
  const rows = (await bookingsOf(j)).filter((r) => j.template === 'cancelled' || !['cancelled', 'expired'].includes(r.status));
  const [c] = await sql`select c.line_user_id, o.status, o.code, o.total, o.due_now, o.paid_amount, o.refund_status, o.refund_amount,
                               o.balance_due, o.balance_due_by::text from customers c join orders o on o.customer_code = c.code
                        where o.code = coalesce(${j.order_code}, (select order_code from bookings where code = ${j.booking_code}))`;
  if (!c?.line_user_id && !forEmail) throw new Error(NO_LINE);
  // ตรวจสถานะล่าสุดก่อนส่ง (ข้อความค้างคิวนาน ๆ ห้ามส่งของที่ไม่จริงแล้ว)
  if (!stillTrue(j.template, c.status, rows.map((r) => r.status))) return 'skip';
  if (j.template === 'balance_due' && !(Number(c.balance_due) > 0)) return 'skip';
  const list = rows.map((r) => `• ${r.biz} ${r.item}${r.pets ? ' · ' + r.pets : ''}\n  ${thDate(r.d)} ${r.t} (${r.code})`).join('\n');
  const items = rows.map((r) => ({ business: r.business_code, color: r.color, type: r.booking_type, biz: `${r.biz} · ${r.code}`, title: `${r.item}${r.pets ? ' · ' + r.pets : ''}`, when: `${thDate(r.d)} · ${r.t}` }));
  const url = await appLink(`/me/b/${c.code}`);
  const payUrl = await appLink(`/pay/${c.code}`);
  const btn = (label: string, path?: string) => { const u = path ? payUrl : url; return u ? { label, url: u } : undefined; };
  const old = typeof j.payload.old === 'string' ? `${thDate(j.payload.old.slice(0, 10))} ${j.payload.old.slice(11, 16)}` : '';
  const due = await amountDue(c.code);
  const qr = due > 0 && await hasPromptPay() ? qrUrl(c.code, due) ?? undefined : undefined;
  const [hold] = await sql`select to_char(hold_until at time zone 'Asia/Bangkok', 'HH24:MI') as t from orders where code = ${c.code} and hold_until is not null`;
  const T: Partial<Record<Template, [string, Card]>> = {
    booked: [`${name}: รับการจองแล้ว · โอน ${baht(due)}${hold?.t ? ` ภายใน ${hold.t} น.` : ''} แล้วแนบสลิปที่ลิงก์\n${list}`,
      { head: name, status: 'รอโอน', headColor: '#C77700', title: 'รับการจองแล้ว',
        body: hold?.t ? `โอนภายใน ${hold.t} น. แล้วแนบสลิป · ไม่ทันเวลาระบบปล่อยที่ให้คนอื่น` : 'โอนแล้วแนบสลิปได้เลย', items,
        rows: [['รหัสการจอง', c.code], ['ยอดรวม', baht(Number(c.total))]], total: ['โอนตอนนี้', baht(due)], image: qr, button: btn('แนบสลิป', `/pay/${c.code}`) }],
    slip_received: [`${name}: ได้รับสลิปแล้ว ร้านกำลังตรวจ · ผลจะแจ้งในแชทนี้\n${list}`,
      { head: `${name} · ได้รับสลิป`, title: 'ได้รับสลิปแล้ว ⏳', body: 'ร้านกำลังตรวจ ผลจะแจ้งในแชทนี้', items, button: btn('ดูการจอง') }],
    paid: [j.payload.balance ? `${name}: ได้รับยอดคงเหลือแล้ว ชำระครบเรียบร้อย ✅\n${list}` : `${name}: ร้านตรวจสลิปแล้ว การจองยืนยันเรียบร้อย ✅\n${list}`,
      { head: name, status: 'ยืนยันแล้ว', headColor: '#1E7B4A', title: j.payload.balance ? 'ชำระครบแล้ว ✅' : 'ยืนยันการจองแล้ว ✅',
        body: j.payload.balance ? undefined : 'ร้านตรวจสลิปเรียบร้อย · ระบบจะเตือนก่อนถึงวัน', steps: j.payload.balance ? undefined : { labels: ['จองแล้ว', 'ตรวจสลิป', 'ยืนยัน'], at: 2 }, items,
        rows: [['รหัสการจอง', c.code], ['ชำระแล้ว', baht(Number(c.paid_amount) || Number(c.due_now))], ...(Number(c.total) > Number(c.due_now) ? [['จ่ายที่ร้าน', baht(Number(c.total) - Number(c.due_now))] as [string, string]] : [])], button: btn('ดูการจอง') }],
    slip_rejected: [`${name}: สลิปยังไม่ผ่าน — ${j.payload.reason ?? ''}\nแนบสลิปใหม่ได้ที่เมนู "การจองของฉัน"\n${list}`,
      { head: `${name} · ตรวจสลิป`, headColor: '#B8262E', title: 'สลิปยังไม่ผ่าน', body: String(j.payload.reason ?? ''), items, button: btn('แนบสลิปใหม่', `/pay/${c.code}`) }],
    reminder: (() => { const r = remindText(String(j.payload.when ?? 'day'), rows[0]); return [`${name}: ${r.title}\n${list}${r.tip ? '\n' + r.tip : ''}`,
      { head: `${name} · ${r.head}`, title: r.title, body: r.tip, items, button: btn('ดูรายละเอียด') }] as [string, Card]; })(),
    cancelled: [`${name}: ยกเลิกการจองแล้ว${j.payload.reason ? ' — ' + j.payload.reason : ''}\n${list}\nเรื่องเงินมัดจำเป็นไปตามเงื่อนไขการยกเลิก ทักแชทร้านได้`,
      { head: `${name} · ยกเลิกการจอง`, headColor: '#B8262E', title: 'ยกเลิกการจองแล้ว', body: `${j.payload.reason ? j.payload.reason + ' · ' : ''}เงินมัดจำเป็นไปตามเงื่อนไขการยกเลิก ทักแชทร้านได้`, items }],
    groom_done: [`${name}: ${rows[0]?.pets || 'น้อง'} อาบน้ำ/แต่งขนเสร็จแล้ว 🐾 มารับได้เลย`,
      { head: `${name} · Grooming`, headColor: '#E8444C', title: `${rows[0]?.pets || 'น้อง'} พร้อมกลับบ้านแล้ว 🐾`, body: 'อาบน้ำ/แต่งขนเสร็จแล้ว มารับได้เลย', items }],
    partial: [`${name}: ได้รับเงิน ${baht(Number(j.payload.got ?? 0))} แล้ว · ยังขาดอีก ${baht(Number(j.payload.left ?? 0))}\nโอนเพิ่มแล้วแนบสลิปได้ที่เมนู "การจองของฉัน"\n${list}`,
      { head: `${name} · ตรวจสลิป`, headColor: '#C77700', title: `ยังขาดอีก ${baht(Number(j.payload.left ?? 0))}`,
        body: `ร้านได้รับ ${baht(Number(j.payload.got ?? 0))} แล้ว · โอนส่วนที่ขาดแล้วแนบสลิปใหม่`, items, image: qr, button: btn('โอนส่วนที่ขาด', `/pay/${c.code}`) }],
    balance_due: [`${name}: เตือนชำระยอดคงเหลือ ${baht(Number(c.balance_due))} ก่อน ${c.balance_due_by ? thDate(c.balance_due_by) : 'วันเข้าพัก'}\n${list}`,
      { head: `${name} · ยอดคงเหลือ`, headColor: '#C77700', title: `ชำระอีก ${baht(Number(c.balance_due))}`,
        body: `ภายใน ${c.balance_due_by ? thDate(c.balance_due_by) : 'ก่อนวันเข้าพัก'}`, items, image: qr, button: btn('ชำระยอดคงเหลือ', `/pay/${c.code}`) }],
    refund: [`${name}: ${refundText(c)}\n${list}`,
      { head: `${name} · คืนเงิน`, title: refundText(c), items, button: btn('ดูการจอง') }],
    closed_day: [`${name}: ขออภัย ร้านปิดในวันที่คุณจองไว้${j.payload.reason ? ' (' + j.payload.reason + ')' : ''}\n${list}\nร้านจะติดต่อเรื่องเลื่อนวันหรือคืนเงินเต็มจำนวน`,
      { head: `${name} · ร้านปิด`, headColor: '#B8262E', title: 'ร้านปิดในวันที่จองไว้', body: `${j.payload.reason ? j.payload.reason + ' · ' : ''}เลื่อนวันหรือรับเงินคืนเต็มจำนวน`, items, button: btn('ดูการจอง') }],
    rescheduled: [`${name}: ร้านเลื่อนวันให้แล้ว${old ? ` (เดิม ${old})` : ''}\n${list}`,
      { head: `${name} · เลื่อนวัน`, title: 'เลื่อนวันเรียบร้อย', body: old ? `วันเดิม ${old}` : undefined, items, button: btn('ดูการจอง') }],
  };
  const m = T[j.template];
  if (!m) return 'skip';
  return { to: c.line_user_id ?? '', text: m[0], card: m[1] };
}
const NO_LINE = 'ลูกค้าไม่มี LINE userId';

// ข้อความเตือนตามประเภทธุรกิจ · when: day = ก่อน 1 วัน · today = เช้าวันเข้าพัก · soon = ก่อนถึงเวลา
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function remindText(when: string, r: any): { head: string; title: string; tip?: string } {
  const t = r?.t ? String(r.t).slice(0, 5) : '';
  const type = r?.booking_type, biz = r?.business_code;
  if (type === 'stay') {
    const pet = biz === 'pet_hotel', w = pet ? 'รับฝากน้อง' : 'เช็กอิน';
    return when === 'today'
      ? { head: `วันนี้${w}`, title: `วันนี้${w} ${t} น.`, tip: pet ? 'อย่าลืมสมุดวัคซีน อาหาร และของใช้ประจำตัวน้อง' : 'ทักแชทร้านได้ถ้าจะถึงช้ากว่าเวลา' }
      : { head: `พรุ่งนี้${w}`, title: `พรุ่งนี้${w} ${t} น.`, tip: pet ? 'เตรียมสมุดวัคซีนและของใช้ประจำตัวน้อง' : undefined };
  }
  const what = type === 'session' ? 'รอบสระ' : 'คิว Grooming';
  return when === 'soon'
    ? { head: `ใกล้ถึง${what}`, title: `อีกไม่นานถึง${what} ${t} น.`, tip: type === 'slot' ? 'พาน้องมาก่อนเวลาสัก 10 นาทีนะ' : undefined }
    : { head: `พรุ่งนี้มี${what}`, title: `พรุ่งนี้${what} ${t} น.`, tip: 'ติดธุระ ทักแชทร้านเพื่อเลื่อนได้' };
}

// แจ้งพนักงานใน LINE (สลิปรอตรวจ) · เฉพาะพนักงานที่ผูก LINE แล้วและเห็นธุรกิจนั้น
async function staffPush(j: Job): Promise<'sent' | 'skip'> {
  const [o] = await sql`select value from settings where key = 'msg_staff_slip'`;
  if (o?.value === 'off') return 'skip';
  const rows = await bookingsOf(j);
  if (!rows.length) return 'skip';
  const biz = [...new Set(rows.map((r) => r.business_code as string))];
  const staff = await sql`select line_user_id from staff where invite_status = 'active' and line_user_id is not null
                          and (role = 'owner' or 'all' = any (businesses) or businesses && ${biz}::text[])`;
  if (!staff.length) return 'skip';
  const name = await shopName();
  const req = j.payload.kind === 'request';
  const url = await appLink(req ? `/admin/b/${rows[0].order_code}` : '/admin/slips');
  const head = req ? `ลูกค้า${String(j.payload.text ?? 'มีคำขอ')}` : 'สลิปรอตรวจ';
  const text = `${name}: ${head} · ${rows[0].customer}\n` + rows.map((r) => `• ${r.biz} ${r.item} ${thDate(r.d)} ${r.t}`).join('\n');
  for (const s of staff) {
    await pushMessage(s.line_user_id, [{ type: 'flex', altText: text.slice(0, 380), contents: flexCard({ head: `${name} · หลังบ้าน`, title: head, body: rows[0].customer,
      items: rows.map((r) => ({ business: r.business_code, color: r.color, type: r.booking_type, biz: `${r.biz} · ${r.code}`, title: r.item, when: `${thDate(r.d)} · ${r.t}` })),
      button: url ? { label: req ? 'เปิดการจอง' : 'ตรวจสลิป', url } : undefined }) }]);
  }
  return 'sent';
}

// ข้อความแต่ละแบบยังจริงอยู่ไหม ณ ตอนส่ง
function stillTrue(t: Template, order: string, bookings: string[]): boolean {
  const live = bookings.some((b) => !['cancelled', 'expired'].includes(b));
  switch (t) {
    case 'booked': return order === 'holding' && live;
    case 'slip_received': return ['pending_review', 'paid'].includes(order) && live;
    case 'paid': return order === 'paid' && live;
    case 'reminder': return order === 'paid' && bookings.includes('confirmed');
    case 'slip_rejected': case 'partial': return order === 'holding';
    case 'balance_due': return order === 'paid' && live;
    case 'rescheduled': case 'groom_done': return live;
    case 'cancelled': case 'refund': case 'closed_day': return true;
    default: return true;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function refundText(c: any) {
  const a = baht(Number(c.refund_amount));
  return c.refund_status === 'credited' ? `คืนเป็นเครดิต ${a} แล้ว ใช้ตอนจองครั้งหน้าได้`
    : c.refund_status === 'refunded' ? `โอนเงินคืน ${a} แล้ว`
    : c.refund_status === 'forfeited' ? 'การยกเลิกนี้ไม่ได้รับเงินคืนตามเงื่อนไขการยกเลิก'
    : `ร้านกำลังดำเนินการคืนเงิน ${a}`;
}

// อีเมลถึงลูกค้า: ใช้ข้อความเดียวกับ LINE (ส่งเมื่อมีอีเมล · สำรองเมื่อ LINE ส่งไม่ได้)
async function customerEmail(j: Job): Promise<{ to: string; subject: string; text: string } | 'skip'> {
  const [c] = await sql`select c.email from customers c join orders o on o.customer_code = c.code
                        where o.code = coalesce(${j.order_code}, (select order_code from bookings where code = ${j.booking_code}))`;
  if (!c?.email) return 'skip';
  const m = await lineFor({ ...j, channel: 'line_push' }, true).catch(() => 'skip' as const);
  if (m === 'skip') return 'skip';
  const url = m.card?.button?.url;
  return { to: c.email, subject: m.card?.head ?? (await shopName()), text: m.text + (url ? `\n\n${m.card?.button?.label ?? 'เปิด'}: ${url}` : '') };
}

async function emailFor(j: Job): Promise<{ subject: string; text: string } | 'skip'> {
  const name = await shopName();
  if (j.template === 'delete_request') {
    const [c] = await sql`select display_name, phone from customers where code = ${j.customer_code}`;
    return { subject: `[${name}] คำขอลบข้อมูล · ${c?.display_name ?? ''}`, text: `${c?.display_name ?? ''}${c?.phone ? ' · ' + c.phone : ''} (${j.customer_code}) ขอลบข้อมูลส่วนตัว\nเคลียร์การจองที่ค้างแล้วลบข้อมูล และแจ้งลูกค้าทางแชท` };
  }
  if (j.template === 'vaccine_review') {
    const [p] = await sql`select p.name, c.display_name from pets p join customers c on c.code = p.customer_code where p.code = ${j.pet_code}`;
    return { subject: `[${name}] วัคซีนรอตรวจ · ${p?.name ?? ''}`, text: `${p?.display_name ?? ''} ส่งรูปวัคซีนของ${p?.name ?? 'น้อง'}\nเปิดหลังบ้าน → วัคซีน เพื่อตรวจ` };
  }
  const rows = await bookingsOf(j);
  if (!rows.length) return 'skip';
  const list = rows.map((r) => `- ${r.biz} · ${r.item}${r.pets ? ' · ' + r.pets : ''} · ${thDate(r.d)} ${r.t} · ${baht(Number(r.price))} (${r.code})`).join('\n');
  const who = `${rows[0].customer}${rows[0].phone ? ' · ' + rows[0].phone : ''}`;
  if (j.template === 'new_booking') return { subject: `[${name}] จองใหม่ · ${who}`, text: `${who} จองแล้ว รอแนบสลิป\n${list}` };
  if (j.template === 'staff_new' && j.payload.kind === 'request') return { subject: `[${name}] ลูกค้า${String(j.payload.text ?? 'มีคำขอ')} · ${who}`, text: `${who}: ${String(j.payload.text ?? '')}\n${list}\nเปิดหลังบ้าน → การจองนี้ เพื่อเลื่อนหรือยกเลิกและคืนเงินตามเงื่อนไข` };
  if (j.template === 'slip_review') return { subject: `[${name}] สลิปรอตรวจ · ${who}`, text: `${who} แนบสลิปแล้ว\n${list}\nเปิดหลังบ้าน → สลิป เพื่อตรวจ` };
  return 'skip';
}

async function runCalendar(j: Job) {
  for (const r of await bookingsOf(j)) {
    if (j.booking_code && r.code !== j.booking_code) continue;
    if (!r.calendar_id) continue;               // ธุรกิจนี้ยังไม่ตั้งปฏิทิน
    if (j.template === 'cancelled') {
      if (r.calendar_event_id) await deleteEvent(r.calendar_id, r.calendar_event_id);
      await sql`update bookings set calendar_event_id = null where code = ${r.code}`;
    } else if (j.template === 'rescheduled' && r.calendar_event_id) {
      await patchEvent(r.calendar_id, r.calendar_event_id, { start: r.s_iso, end: r.e_iso });
    } else if (r.status !== 'cancelled' && r.status !== 'expired') {
      const id = await insertEvent(r.calendar_id, {
        id: eventId(r.code),
        summary: `${r.item}${r.pets ? ' · ' + r.pets : ''} (${r.code})`,
        // ไม่ใส่เบอร์โทรและยอดเงินในปฏิทิน (ปฏิทินอาจแชร์ให้หลายคนเห็น)
        description: `${r.biz} · ลูกค้า ${r.customer}\nดูรายละเอียดในหลังบ้าน`,
        start: r.s_iso, end: r.e_iso,
      });
      await sql`update bookings set calendar_event_id = ${id} where code = ${r.code}`;
    }
  }
}

// ช่องทางที่ตั้งค่าแล้วเท่านั้นที่ส่ง (ยังไม่ตั้ง = ค้างในคิวไว้ก่อน)
function readyChannels(): Channel[] {
  const out: Channel[] = [];
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN) out.push('line_push');
  if (emailReady()) out.push('email');
  if (calendarReady()) out.push('calendar');
  return out;
}

// ส่งรายการที่ถึงเวลา (รอบตั้งเวลา หรือหลังพนักงานกดทันที)
export async function sendDue(limit = 20, onlyId?: number): Promise<{ sent: number; failed: number; skipped: number }> {
  const ch = readyChannels();
  if (!ch.length) return { sent: 0, failed: 0, skipped: 0 };
  // แถวที่ค้างสถานะกำลังส่งเกิน 10 นาที (ส่งไม่จบ) คืนเข้าคิว
  await sql`update notifications set status = 'queued' where status = 'sending' and claimed_at < now() - interval '10 minutes'`;
  // หยิบแถวพร้อมเปลี่ยนเป็นกำลังส่งในคำสั่งเดียว กันรอบส่งที่ทับกันหยิบแถวเดิม
  const jobs = await sql<Job[]>`
    update notifications n set tries = tries + 1, status = 'sending', claimed_at = now()
    where n.id in (select id from notifications
                   where status = 'queued' and run_after <= now() and channel in ${sql(ch)}
                     and (${onlyId ?? null}::bigint is null or id = ${onlyId ?? null})
                   order by run_after limit ${limit} for update skip locked)
    returning n.id, n.order_code, n.booking_code, n.pet_code, n.customer_code, n.channel, n.template, n.payload, n.to_customer, n.tries`;
  let sent = 0, failed = 0, skipped = 0;
  for (const j of jobs) {
    try {
      let done: 'sent' | 'skip' = 'sent';
      if (j.channel === 'line_push' && j.template === 'staff_new') {
        done = await staffPush(j);
      } else if (j.channel === 'line_push') {
        const m = await lineFor(j);
        if (m === 'skip') done = 'skip';
        else await pushMessage(m.to, [m.card ? { type: 'flex', altText: m.text.slice(0, 380), contents: flexCard(m.card) } : { type: 'text', text: m.text }]);
      } else if (j.channel === 'email' && j.to_customer) {
        const m = await customerEmail(j);
        if (m === 'skip') done = 'skip';
        else await sendEmail([m.to], m.subject, m.text);
      } else if (j.channel === 'email') {
        const [to] = await sql`select value from settings where key = 'notify_email'`;
        const m = await emailFor(j);
        if (m === 'skip' || !to?.value) done = 'skip';
        else await sendEmail(String(to.value).split(',').map((x) => x.trim()).filter(Boolean), m.subject, m.text);
      } else {
        await runCalendar(j);
      }
      await sql`update notifications set status = 'sent', sent_at = now(),
                  last_error = ${done === 'skip' ? 'ข้าม: ไม่ต้องส่ง' : null} where id = ${j.id}`;
      if (done === 'skip') skipped++; else sent++;
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300);
      // LINE ส่งไม่ได้ (ไม่มี LINE หรือพลาดครบ 5 ครั้ง) → อีเมลสำรองถึงลูกค้าที่กรอกอีเมลไว้
      if (j.channel === 'line_push' && j.template !== 'staff_new' && !EMAIL_COPY.includes(j.template) && (msg === NO_LINE || j.tries >= 5)) {
        await sql`insert into notifications (order_code, booking_code, channel, template, payload, to_customer)
                  values (${j.order_code}, ${j.booking_code}, 'email', ${j.template}, ${sql.json(j.payload as never)}, true)`;
        await sql`update notifications set status = 'failed', last_error = ${msg + ' · ส่งอีเมลสำรองแทน'} where id = ${j.id}`;
        failed++;
        continue;
      }
      // ลองใหม่ห่างขึ้นเรื่อย ๆ · ครบ 5 ครั้งหยุด
      await sql`update notifications set last_error = ${msg},
                  status = case when tries >= 5 then 'failed' else 'queued' end,
                  run_after = now() + make_interval(mins => power(2, tries)::int)
                where id = ${j.id}`;
      failed++;
    }
  }
  return { sent, failed, skipped };
}

// ---------- การ์ดสถานะการจอง (ตอบเมื่อลูกค้าส่งรหัสการจองเข้าแชท) ----------
const ST_HEAD: Record<string, [string, string, string]> = {
  holding: ['รอโอน', '#C77700', 'ยืนยันการจองแล้ว · รอโอน'], pending_review: ['กำลังตรวจสลิป', '#1F5FA8', 'ได้รับสลิปแล้ว'],
  paid: ['ยืนยันแล้ว', '#1E7B4A', 'จองเรียบร้อย ✅'], cancelled: ['ยกเลิก', '#B8262E', 'การจองนี้ยกเลิกแล้ว'], expired: ['หมดเวลา', '#9A9A96', 'หมดเวลาโอน · จองใหม่ได้'],
};
export async function statusMessage(orderCode: string): Promise<LineMessage | null> {
  const [o] = await sql`select code, status, total, due_now, paid_amount, balance_due, balance_due_by::text as by,
                               to_char(hold_until at time zone 'Asia/Bangkok', 'HH24:MI') as hold from orders where code = ${orderCode}`;
  if (!o) return null;
  const name = await shopName();
  const rows = (await bookingsOf({ order_code: o.code, booking_code: null } as unknown as Job))
    .filter((r) => ['cancelled', 'expired'].includes(o.status) || !['cancelled', 'expired'].includes(r.status));
  const items = rows.map((r) => ({ business: r.business_code, color: r.color, type: r.booking_type, biz: `${r.biz} · ${r.code}`, title: `${r.item}${r.pets ? ' · ' + r.pets : ''}`, when: `${thDate(r.d)} · ${r.t}` }));
  const [lab, color, title] = ST_HEAD[o.status] ?? [o.status, '#111111', o.status];
  const due = await amountDue(o.code);
  const money: [string, string][] = [['ยอดรวม', baht(Number(o.total))], ...(Number(o.paid_amount) > 0 ? [['ชำระแล้ว', baht(Number(o.paid_amount))] as [string, string]] : [])];
  if (o.status === 'holding') money.push(['ต้องโอน', baht(due)]);
  if (o.status === 'paid' && Number(o.balance_due) > 0) money.push([`ยอดคงเหลือ · ก่อน ${o.by ? thDate(o.by) : 'วันเข้าพัก'}`, baht(Number(o.balance_due))]);
  const url = await appLink(o.status === 'holding' || due > 0 ? `/pay/${o.code}` : `/me/b/${o.code}`);
  const at = o.status === 'holding' ? 0 : o.status === 'pending_review' ? 1 : o.status === 'paid' ? 2 : -1;
  const sub = o.status === 'holding' ? (o.hold ? `โอนภายใน ${o.hold} น. แล้วแนบสลิป` : 'โอนแล้วแนบสลิป')
    : o.status === 'pending_review' ? 'ได้รับสลิปแล้ว ร้านกำลังตรวจ · ผลจะแจ้งในแชทนี้'
    : o.status === 'paid' ? 'แล้วพบกันนะ · ระบบจะเตือนก่อนถึงวัน' : undefined;
  const meUrl = await appLink(`/me/b/${o.code}`);
  const card: Card = { head: name, status: lab, headColor: color, title, body: sub,
    steps: at >= 0 ? { labels: ['จองแล้ว', 'ตรวจสลิป', 'ยืนยัน'], at } : undefined,
    items, rows: [['รหัสการจอง', o.code], ...money.filter(([k]) => k !== 'ต้องโอน')],
    total: o.status === 'holding' ? ['โอนตอนนี้', baht(due)] : undefined,
    image: due > 0 && o.status === 'holding' && await hasPromptPay() ? qrUrl(o.code, due) ?? undefined : undefined,
    button: url ? { label: due > 0 ? 'แนบสลิป' : 'ดูการจอง', url } : undefined,
    button2: due > 0 && meUrl ? { label: 'ดูรายละเอียดการจอง', url: meUrl } : undefined };
  return { type: 'flex', altText: `${name}: ${o.code} · ${title}`.slice(0, 380), contents: flexCard(card) } as LineMessage;
}
