import 'server-only';
import { sql } from './db';
import { enqueue } from './notify';
import { BookingError } from './booking';
import { canSee, type StaffUser } from './staff';

// แก้ตั้งค่าร้านจากหลังบ้าน · เจ้าของแก้ได้ทุกอย่าง · ผู้จัดการแก้ได้เฉพาะธุรกิจที่ดูแล
type D = Record<string, unknown>;
const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));
const money = (v: unknown, req = false) => { const n = num(v); if (n === null) { if (req) throw new BookingError('bad', 'กรอกราคา'); return null; } if (!(n >= 0 && n < 1e6)) throw new BookingError('bad', 'ตัวเลขไม่ถูกต้อง'); return n; };
const int = (v: unknown, min = 0, max = 999) => { const n = num(v); if (n === null) return null; if (!Number.isInteger(n) || n < min || n > max) throw new BookingError('bad', 'จำนวนไม่ถูกต้อง'); return n; };
const time = (v: unknown) => { const s = str(v, 5); if (!/^\d{2}:\d{2}$/.test(s)) throw new BookingError('bad', 'เวลาไม่ถูกต้อง'); return s; };
const days = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => n >= 1 && n <= 7))].sort() : []);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function need(s: StaffUser, biz: string) {
  if (s.role === 'staff' || !canSee(s, biz)) throw new BookingError('forbidden', 'ไม่มีสิทธิ์แก้ตั้งค่าธุรกิจนี้');
}
function owner(s: StaffUser) { if (s.role !== 'owner') throw new BookingError('forbidden', 'เฉพาะเจ้าของร้าน'); }
async function bizOfUnit(code: string) { const [u] = await sql`select business_code from units where code = ${code}`; if (!u) throw new BookingError('not_found', 'ไม่พบรายการ'); return u.business_code as string; }
async function bizOfService(code: string) { const [u] = await sql`select business_code from services where code = ${code}`; if (!u) throw new BookingError('not_found', 'ไม่พบบริการ'); return u.business_code as string; }
async function bizOfSession(code: string) { const [u] = await sql`select u.business_code from pool_sessions s join units u on u.code = s.unit_code where s.code = ${code}`; if (!u) throw new BookingError('not_found', 'ไม่พบรอบ'); return u.business_code as string; }

// สร้างข้อความนโยบายจากขั้นคืนเงิน
export function policyText(rules: { days: number; refund: number }[], unit = 'วัน') {
  const r = [...rules].sort((a, b) => b.days - a.days);
  if (!r.length) return 'ยกเลิกแล้วไม่คืนมัดจำ';
  const parts = r.map((x) => `ยกเลิกก่อน ${x.days} ${unit}ขึ้นไป คืน ${x.refund}%`);
  return `${parts.join(' · ')} · น้อยกว่า ${r[r.length - 1].days} ${unit} ไม่คืน`;
}

export async function applySetting(s: StaffUser, kind: string, d: D) {
  switch (kind) {
    // ---------- ห้อง / บ้าน / สระ (units) ----------
    case 'unit.save': {
      const code = str(d.code, 40);
      const biz = code ? await bizOfUnit(code) : str(d.business_code, 40);
      need(s, biz);
      const f = {
        name: str(d.name, 60), summary: str(d.summary, 120) || null, price: money(d.price, true),
        weekend_price: money(d.weekend_price), max_people: int(d.max_people, 1, 99), bedrooms: int(d.bedrooms, 0, 50),
        max_pets: int(d.max_pets, 0, 50), max_pet_kg: num(d.max_pet_kg), pet_fee: money(d.pet_fee), rules: str(d.rules, 400) || null,
      };
      if (!f.name) throw new BookingError('bad', 'กรอกชื่อ');
      if (code) await sql`update units set ${sql(f)} where code = ${code}`;
      else {
        const [{ c }] = await sql`select next_code('U') as c`;
        await sql`insert into units ${sql({ ...f, code: c, business_code: biz, sort: 99 })}`;
        return { code: c };
      }
      return { code };
    }
    case 'unit.active': { const code = str(d.code, 40); need(s, await bizOfUnit(code)); await sql`update units set active = ${!!d.active} where code = ${code}`; return {}; }
    case 'photo.delete': {
      const id = Number(d.id);
      const [p] = await sql`select coalesce(u.business_code, sv.business_code) as biz from unit_photos p left join units u on u.code = p.unit_code left join services sv on sv.code = p.service_code where p.id = ${id}`;
      if (!p) throw new BookingError('not_found', 'ไม่พบรูป'); need(s, p.biz);
      await sql`delete from unit_photos where id = ${id}`; return {};
    }
    case 'photo.cover': {
      const id = Number(d.id);
      const [p] = await sql`select p.unit_code, p.service_code, coalesce(u.business_code, sv.business_code) as biz from unit_photos p left join units u on u.code = p.unit_code left join services sv on sv.code = p.service_code where p.id = ${id}`;
      if (!p) throw new BookingError('not_found', 'ไม่พบรูป'); need(s, p.biz);
      await sql.begin(async (tx) => {
        await tx`update unit_photos set is_cover = false where coalesce(unit_code, service_code) = ${p.unit_code ?? p.service_code}`;
        await tx`update unit_photos set is_cover = true where id = ${id}`;
      });
      return {};
    }
    // ---------- รอบสระ ----------
    case 'session.save': {
      const code = str(d.code, 40);
      const unit = str(d.unit_code, 40);
      const biz = code ? await bizOfSession(code) : await bizOfUnit(unit);
      need(s, biz);
      const f = {
        start_time: time(d.start_time), end_time: time(d.end_time), weekdays: days(d.weekdays),
        size_rule: ['small', 'large', 'all'].includes(String(d.size_rule)) ? String(d.size_rule) : 'all',
        capacity: int(d.capacity, 1, 500) ?? 10, price: money(d.price, true), active: d.active !== false,
      };
      if (!f.weekdays.length) throw new BookingError('bad', 'เลือกวันที่เปิดอย่างน้อย 1 วัน');
      if (f.end_time <= f.start_time) throw new BookingError('bad', 'เวลาจบต้องหลังเวลาเริ่ม');
      if (code) await sql`update pool_sessions set ${sql(f)} where code = ${code}`;
      else { const [{ c }] = await sql`select next_code('S') as c`; await sql`insert into pool_sessions ${sql({ ...f, code: c, unit_code: unit })}`; return { code: c }; }
      return { code };
    }
    case 'session.delete': {
      const code = str(d.code, 40); need(s, await bizOfSession(code));
      const [{ n }] = await sql`select count(*)::int as n from bookings where session_code = ${code} and start_at > now() and status in ('holding','confirmed')`;
      if (n) throw new BookingError('in_use', `ลบไม่ได้ มีคนจองรอบนี้ไว้ ${n} รายการ · ปิดรับจองแทนได้`);
      await sql`update pool_sessions set active = false where code = ${code}`;   // เก็บไว้เพื่อประวัติการจอง
      return {};
    }
    // ---------- บริการ Grooming ----------
    case 'service.save': {
      const code = str(d.code, 40);
      const biz = code ? await bizOfService(code) : str(d.business_code, 40);
      need(s, biz);
      const kind2 = d.kind === 'addon' ? 'addon' : 'main';
      const mode = d.price_mode === 'by_weight' && kind2 === 'main' ? 'by_weight' : 'flat';
      const f = { name: str(d.name, 60), description: str(d.description, 120) || null, kind: kind2, price_mode: mode,
        price: mode === 'flat' ? money(d.price, true) : null, duration_min: mode === 'flat' ? int(d.duration_min, 5, 600) ?? 30 : null };
      if (!f.name) throw new BookingError('bad', 'กรอกชื่อบริการ');
      const prices = Array.isArray(d.prices) ? (d.prices as D[]) : [];
      return sql.begin(async (tx) => {
        let c = code;
        if (c) await tx`update services set ${tx(f)} where code = ${c}`;
        else { [{ c }] = await tx`select next_code('SV') as c`; await tx`insert into services ${tx({ ...f, code: c, business_code: biz, sort: 50 })}`; }
        if (mode === 'by_weight') {
          for (const p of prices) {
            const tier = str(p.tier_code, 10); const pr = money(p.price, true); const mn = int(p.duration_min, 5, 600) ?? 60;
            await tx`insert into service_prices (service_code, tier_code, price, duration_min) values (${c}, ${tier}, ${pr}, ${mn})
                     on conflict (service_code, tier_code) do update set price = excluded.price, duration_min = excluded.duration_min`;
          }
        }
        return { code: c };
      });
    }
    case 'service.active': { const code = str(d.code, 40); need(s, await bizOfService(code)); await sql`update services set active = ${!!d.active} where code = ${code}`; return {}; }
    // ---------- เวลาเปิด · วันปิด ----------
    case 'hours.save': {
      const biz = str(d.business_code, 40); need(s, biz);
      await sql`update businesses set open_hours = ${str(d.open_hours, 60) || null}, closed_weekdays = ${days(d.closed_weekdays)},
                  checkin_time = coalesce(${str(d.checkin_time, 20) || null}, checkin_time), checkout_time = coalesce(${str(d.checkout_time, 20) || null}, checkout_time)
                where code = ${biz}`;
      return {};
    }
    case 'closure.add': {
      const biz = str(d.business_code, 40); need(s, biz);
      const from = str(d.date_from, 10), to = str(d.date_to, 10) || from;
      if (!DATE.test(from) || !DATE.test(to) || to < from) throw new BookingError('bad', 'เลือกวันที่ให้ถูกต้อง');
      const unit = str(d.unit_code, 40) || null, sess = str(d.session_code, 40) || null;
      const reason = str(d.reason, 80) || null;
      // การจองที่โดนวันปิด: ต้องยืนยันก่อน แล้วระบบแจ้งลูกค้าทุกคน (ร้านเลื่อน/คืนเงินเต็มต่อในหน้าการจอง)
      const hit = await sql`
        select distinct k.order_code, o.status as order_status from bookings k join orders o on o.code = k.order_code
        where k.business_code = ${biz} and booking_active(k.status)
          and (${unit}::text is null or k.unit_code = ${unit}) and (${sess}::text is null or k.session_code = ${sess})
          and tstzrange(k.start_at, k.end_at, '[)') && tstzrange((${from}::date)::timestamp at time zone 'Asia/Bangkok', ((${to}::date) + 1)::timestamp at time zone 'Asia/Bangkok', '[)')`;
      if (hit.length && d.notify !== true) throw new BookingError('has_bookings', `มีลูกค้าจองไว้แล้ว ${hit.length} การจองในช่วงนี้ · ติ๊ก "แจ้งลูกค้าที่จองไว้" แล้วกดเพิ่มอีกครั้ง`);
      await sql.begin(async (tx) => {
        await tx`insert into closures (business_code, unit_code, session_code, date_from, date_to, reason)
                  values (${biz}, ${unit}, ${sess}, ${from}, ${to}, ${reason})`;
        for (const h of hit) {
          if (h.order_status === 'holding') {
            // ยังไม่ได้ยืนยัน (รอสลิป) → ยกเลิกเลย กันลูกค้าโอนเข้ามาในวันที่ปิด · เงินที่ได้บางส่วน/เครดิตคืนอัตโนมัติ
            const [c] = await tx`update orders set status = 'cancelled', cancel_source = 'closed', hold_until = null
                                 where code = ${h.order_code} and status = 'holding' returning code`;
            if (!c) continue;
            await tx`update bookings set status = 'cancelled' where order_code = ${h.order_code} and status = 'holding'`;
            await tx`update payments set status = 'rejected', reject_kind = 'other', reject_reason = 'ร้านปิดวันที่จอง'
                     where order_code = ${h.order_code} and status = 'pending'`;
            await tx`select release_money(${h.order_code})`;
            await enqueue(tx, { order: h.order_code, channel: 'line_push', template: 'cancelled',
              payload: { reason: `ร้านปิดวันที่จอง${reason ? ' (' + reason + ')' : ''} · จองวันอื่นได้เลย` } });
          } else {
            await enqueue(tx, { order: h.order_code, channel: 'line_push', template: 'closed_day', payload: { reason } });
          }
        }
      });
      return { affected: hit.length };
    }
    case 'calendar.save': {
      // รหัสปฏิทิน Google ของแต่ละธุรกิจ (ไม่ใช่ค่าลับ · แชร์ปฏิทินให้อีเมล service account ก่อน)
      const biz = str(d.business_code, 40); need(s, biz);
      const cal = str(d.calendar_id, 200);
      if (cal && !/^[\w.+-]+@[\w.-]+$/.test(cal)) throw new BookingError('bad', 'รหัสปฏิทินมีรูปแบบเหมือนอีเมล เช่น xxxx@group.calendar.google.com');
      await sql`update businesses set calendar_id = ${cal || null} where code = ${biz}`;
      return {};
    }
    case 'closure.delete': {
      const [c] = await sql`select business_code from closures where id = ${Number(d.id)}`;
      if (!c) throw new BookingError('not_found', 'ไม่พบรายการ'); need(s, c.business_code);
      await sql`delete from closures where id = ${Number(d.id)}`; return {};
    }
    // ---------- มัดจำและยกเลิก ----------
    case 'deposit.save': {
      const biz = str(d.business_code, 40); need(s, biz);
      const type = ['full', 'percent', 'fixed'].includes(String(d.deposit_type)) ? String(d.deposit_type) : 'full';
      const val = type === 'full' ? null : money(d.deposit_value, true);
      if (type === 'percent' && !(val! >= 1 && val! <= 100)) throw new BookingError('bad', 'มัดจำเป็น % ต้องอยู่ระหว่าง 1–100');
      const rules = (Array.isArray(d.cancel_rules) ? (d.cancel_rules as D[]) : [])
        .map((r) => ({ days: int(r.days, 0, 365) ?? 0, refund: int(r.refund, 0, 100) ?? 0 })).sort((a, b) => b.days - a.days).slice(0, 6);
      const text = str(d.cancel_policy, 400) || policyText(rules);
      const bd = type === 'full' || !d.balance_days ? null : Math.min(60, Math.max(1, Math.round(Number(d.balance_days)) || 0)) || null;
      const guide = d.guide === undefined ? undefined : (str(d.guide, 2000) || null);
      if (guide !== undefined) await sql`update businesses set guide = ${guide} where code = ${biz}`;
      await sql`update businesses set deposit_type = ${type}, deposit_value = ${val}, balance_days = ${bd}, cancel_rules = ${sql.json(rules)}, cancel_policy = ${text} where code = ${biz}`;
      if (d.hold_minutes !== undefined) { owner(s); const h = int(d.hold_minutes, 5, 1440) ?? 30; await sql`update settings set value = ${String(h)} where key = 'hold_minutes'`; }
      return {};
    }
    // ---------- แนะนำข้ามบริการ ----------
    case 'xsell.active': {
      const [x] = await sql`select from_business from cross_sells where id = ${Number(d.id)}`;
      if (!x) throw new BookingError('not_found', 'ไม่พบรายการ'); need(s, x.from_business);
      await sql`update cross_sells set active = ${!!d.active} where id = ${Number(d.id)}`; return {};
    }
    // ---------- ค่าร้าน (เจ้าของ) ----------
    case 'settings.save': {
      owner(s);
      const ALLOW = ['liff_id', 'shop_name', 'legal_name', 'promptpay_id', 'account_name', 'notify_email', 'line_oa_id', 'shop_phone', 'shop_address', 'shop_map_url', 'remind_hours_before', 'remind_day_before', 'remind_day_at', 'remind_soon_min',
        'msg_booked', 'msg_slip_received', 'msg_paid', 'msg_reminder', 'msg_slip_rejected', 'msg_groom_done', 'msg_cancelled', 'msg_vaccine', 'msg_rescheduled',
        'ocr_enabled', 'ocr_month_limit'];
      const v = (d.values ?? {}) as D;
      for (const [k, val] of Object.entries(v)) {
        if (!ALLOW.includes(k)) continue;
        let x = str(val, 200);
        if (k === 'promptpay_id' && x && !/^(\d{10}|\d{13}|\d{15})$/.test(x.replace(/\D/g, ''))) throw new BookingError('bad', 'เลขพร้อมเพย์ต้องเป็นเบอร์ 10 หลัก หรือเลข 13/15 หลัก');
        if (k === 'promptpay_id') x = x.replace(/\D/g, '');
        if (k === 'ocr_month_limit' && !/^\d{1,6}$/.test(x)) throw new BookingError('bad', 'ใส่จำนวนรูปต่อเดือนเป็นตัวเลข');
        if (k === 'ocr_enabled' && x !== 'on' && x !== 'off') throw new BookingError('bad', 'ค่าต้องเป็น on หรือ off');
        if (k === 'liff_id' && x && !/^\d{6,}-[A-Za-z0-9]{4,}$/.test(x)) throw new BookingError('bad', 'LIFF ID ต้องเป็นรูปแบบ 2001234567-AbCdEfGh');
        if (k.startsWith('msg_')) x = x === 'off' ? 'off' : 'on';
        await sql`insert into settings (key, value) values (${k}, ${x}) on conflict (key) do update set value = excluded.value`;
      }
      return {};
    }
  }
  throw new BookingError('bad_kind', 'คำสั่งไม่ถูกต้อง');
}
