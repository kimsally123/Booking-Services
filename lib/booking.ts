import 'server-only';
import { sql } from './db';
import type { Business, CartItem, Pet, Quote, QuoteItem, QuoteLine } from './types';
import { BOOK_AHEAD_MONTHS, lastBookable, maxNights } from './rules';
import { addDays, baht, daysBetween, firstTime, fromMin, isoDow, thDate, thRange, thRangeDow, toMin, todayTH } from './thaidate';

// เวลาไทย → timestamptz
export const at = (date: string, time: string) => `${date} ${time}+07`;
const ACTIVE = ['holding', 'confirmed', 'checked_in', 'in_progress'];
const SLOT_STEP = 30;        // ช่องเวลา Grooming ทุก 30 นาที
const LEAD_MIN = 60;         // จองวันนี้ได้ตั้งแต่อีก 60 นาทีข้างหน้า

export class BookingError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

async function business(code: string): Promise<Business> {
  const [b] = await sql<Business[]>`select * from businesses where code = ${code} and active`;
  if (!b) throw new BookingError('business_not_found', 'ไม่พบธุรกิจนี้');
  return b;
}

async function petsOf(customer: string, codes: string[]): Promise<Pet[]> {
  if (!codes.length) return [];
  const rows = await sql<Pet[]>`
    select p.code, p.name, p.species, p.breed, p.weight_kg, p.note, tier_for(p.weight_kg) as tier_code,
           (select to_char(max(v.expires_on), 'YYYY-MM-DD') from pet_vaccines v
             where v.pet_code = p.code and v.status = 'approved') as vaccine_until, false as vaccine_pending
    from pets p where p.customer_code = ${customer} and p.code in ${sql(codes)}`;
  if (rows.length !== new Set(codes).size) throw new BookingError('pet_not_owner', 'มีน้องที่ไม่ใช่ของบัญชีนี้');
  return [...rows];
}

function needVaccine(b: Business, pets: Pet[], onDate: string) {
  if (!b.need_vaccine) return;
  const bad = pets.filter((p) => !p.vaccine_until || p.vaccine_until < onDate);
  if (bad.length) throw new BookingError('vaccine_required', `${bad.map((p) => p.name).join(', ')} ยังไม่มีวัคซีนที่ผ่านตรวจถึงวันที่ใช้บริการ`);
}

export function depositOf(b: Business, price: number, firstNight = price): number {
  if (b.deposit_type === 'full') return price;
  if (b.deposit_type === 'first_night') return Math.min(firstNight, price);
  if (b.deposit_type === 'percent') return Math.round((price * Number(b.deposit_value)) / 100);
  return Math.min(Number(b.deposit_value), price);
}

const stayTimes = (b: Business) => ({ in: firstTime(b.checkin_time, '14:00'), out: firstTime(b.checkout_time, '12:00') });

// ---------- ห้อง/บ้าน: ช่วงวัน ----------
export async function stayAvailability(bizCode: string, from: string, to: string, petCount: number, guests: number | null, maxKg: number | null) {
  const b = await business(bizCode);
  if (b.booking_type !== 'stay') throw new BookingError('wrong_type', 'ธุรกิจนี้ไม่ใช่การจองแบบช่วงวัน');
  const nights = daysBetween(from, to);
  if (nights < 1 || nights > 60) throw new BookingError('bad_range', 'เลือกวันเข้าและวันออกใหม่');
  const t = stayTimes(b);
  const rows = await sql`
    select u.code, u.max_people, u.max_pets, u.max_pet_kg,
      exists (select 1 from bookings k where k.unit_code = u.code and k.kind = 'stay' and k.status in ${sql(ACTIVE)}
              and tstzrange(k.start_at, k.end_at, '[)') && tstzrange(${at(from, t.in)}::timestamptz, ${at(to, t.out)}::timestamptz, '[)')) as taken,
      (select c.reason from closures c, generate_series(${from}::date, ${to}::date - 1, '1 day') d
        where c.business_code = u.business_code and d::date between c.date_from and c.date_to
          and (c.unit_code is null or c.unit_code = u.code) and c.session_code is null limit 1) as closed
    from units u where u.business_code = ${bizCode} and u.active order by u.sort, u.code`;
  return rows.map((r) => {
    let reason: string | null = null;
    if (r.taken) reason = 'ไม่ว่างช่วงนี้';
    else if (r.closed !== null) reason = r.closed || 'ปิดช่วงนี้';
    else if (guests && r.max_people && guests > r.max_people) reason = `รับได้ ${r.max_people} คน`;
    else if (petCount && r.max_pets !== null && petCount > r.max_pets) reason = r.max_pets ? `รับน้องได้ ${r.max_pets} ตัว` : 'ไม่รับน้อง';
    else if (maxKg && r.max_pet_kg && maxKg > Number(r.max_pet_kg)) reason = `น้องไม่เกิน ${r.max_pet_kg} กก.`;
    return { code: r.code as string, free: !reason, reason };
  });
}

// ---------- รอบสระ ----------
export async function sessionAvailability(bizCode: string, date: string, petKgs: number[]) {
  const b = await business(bizCode);
  if (b.booking_type !== 'session') throw new BookingError('wrong_type', 'ธุรกิจนี้ไม่ใช่การจองแบบรอบ');
  const dow = isoDow(date);
  const rows = await sql`
    select s.code, to_char(s.start_time, 'HH24:MI') as start, to_char(s.end_time, 'HH24:MI') as "end", s.size_rule, s.capacity,
           session_left(s.code, (${date}::date + s.start_time) at time zone 'Asia/Bangkok') as left,
           is_closed(${bizCode}, s.unit_code, s.code, ${date}::date) as closed,
           ((${date}::date + s.start_time) at time zone 'Asia/Bangkok') < now() as past
    from pool_sessions s join units u on u.code = s.unit_code
    where u.business_code = ${bizCode} and s.active and u.active and ${dow} = any (s.weekdays)
    order by s.start_time`;
  return rows.map((r) => {
    const fits = petKgs.every((kg) => (r.size_rule === 'small' ? kg <= 10 : r.size_rule === 'large' ? kg > 10 : true));
    let reason: string | null = null;
    if (r.closed) reason = 'ปิดวันนี้';
    else if (r.past) reason = 'เลยเวลาแล้ว';
    else if (!fits) reason = 'ขนาดน้องไม่ตรงรอบ';
    else if (r.left < Math.max(1, petKgs.length)) reason = r.left > 0 ? `เหลือ ${r.left} ที่` : 'เต็ม';
    return { code: r.code as string, start: r.start as string, end: r.end as string, size_rule: r.size_rule as string,
             capacity: r.capacity as number, left: r.left as number, free: !reason, reason };
  });
}

// ---------- Grooming: เวลา × ช่าง ----------
async function groomDuration(bizCode: string, service: string, addons: string[], tier: string | null) {
  const [s] = await sql`
    select s.code, s.name, s.price_mode, s.price, s.duration_min, sp.price as tier_price, sp.duration_min as tier_min
    from services s left join service_prices sp on sp.service_code = s.code and sp.tier_code = ${tier}
    where s.code = ${service} and s.business_code = ${bizCode} and s.kind = 'main' and s.active`;
  if (!s) throw new BookingError('service_invalid', 'ไม่พบบริการนี้');
  const price = s.price_mode === 'by_weight' ? s.tier_price : s.price;
  const mins = s.price_mode === 'by_weight' ? s.tier_min : s.duration_min;
  if (price === null || mins === null) throw new BookingError('no_price', 'บริการนี้ยังไม่มีราคาสำหรับขนาดน้อง');
  const add = addons.length
    ? await sql`select code, name, price, duration_min from services
                where code in ${sql(addons)} and business_code = ${bizCode} and kind = 'addon' and active`
    : [];
  if (add.length !== new Set(addons).size) throw new BookingError('addon_invalid', 'บริการเสริมไม่ถูกต้อง');
  return {
    name: s.name as string, price: Number(price), mins: Number(mins),
    addons: add.map((a) => ({ code: a.code as string, name: a.name as string, price: Number(a.price), mins: Number(a.duration_min || 0) })),
  };
}

// ช่างทำขนที่รับธุรกิจนี้ (วันทำงาน · เวลา · โควตาคิวต่อวัน)
export type Groomer = { code: string; display_name: string; ws: string; we: string; work_days: number[]; quota: number };
export async function groomers(bizCode: string): Promise<Groomer[]> {
  const rows = await sql`
    select code, display_name, to_char(work_start, 'HH24:MI') as ws, to_char(work_end, 'HH24:MI') as we,
           work_days, daily_quota as quota
    from staff where is_groomer and invite_status <> 'removed'
      and (${bizCode} = any (businesses) or 'all' = any (businesses))
    order by code`;
  return rows.map((r) => ({ code: r.code, display_name: r.display_name, ws: r.ws, we: r.we,
                            work_days: (r.work_days as number[]).map(Number), quota: Number(r.quota) }));
}

// เวลาเริ่มที่ช่างคนนี้รับได้ (ทุก 30 นาที · ไม่ชนคิวเดิม · ไม่ก่อนเวลาที่จองทันวันนี้)
export function groomerStarts(g: Groomer, busy: [number, number][], total: number, nowMin: number, includeBusy = false): number[] {
  const out: number[] = [];
  for (let m = toMin(g.ws); m + total <= toMin(g.we); m += SLOT_STEP) {
    if (m < nowMin) continue;
    if (!includeBusy && busy.some(([a, z]) => m < z && a < m + total)) continue;
    out.push(m);
  }
  return out;
}
export const leadNow = (date: string) =>
  date === todayTH() ? toMin(new Date(Date.now() + 7 * 3600000).toISOString().slice(11, 16)) + LEAD_MIN : -1;

export async function groomMinutes(bizCode: string, service: string, addons: string[], tier: string | null) {
  const d = await groomDuration(bizCode, service, addons, tier);
  return d.mins + d.addons.reduce((a, x) => a + x.mins, 0);
}

export async function slotAvailability(bizCode: string, date: string, service: string, addons: string[], tier: string | null, pets: string[] = []) {
  const b = await business(bizCode);
  if (b.booking_type !== 'slot') throw new BookingError('wrong_type', 'ธุรกิจนี้ไม่ใช่การจองแบบช่องเวลา');
  const total = await groomMinutes(bizCode, service, addons, tier);
  type Slot = { start: string; staff: string; staff_name: string };
  const [{ closed }] = await sql`select is_closed(${bizCode}, null, null, ${date}::date) as closed`;
  if (closed) return { minutes: total, slots: [] as Slot[], grid: [] as { start: string; staff: string | null; staff_name: string | null; free: { staff: string; staff_name: string }[] }[], closed: true };

  const dow = isoDow(date);
  const working = (await groomers(bizCode)).filter((g) => g.work_days.includes(dow));
  const bk = working.length ? await sql`
    select staff_code, to_char(start_at at time zone 'Asia/Bangkok', 'HH24:MI') as a, to_char(end_at at time zone 'Asia/Bangkok', 'HH24:MI') as z
    from bookings where kind = 'slot' and status in ${sql(ACTIVE)} and staff_code in ${sql(working.map((g) => g.code))}
      and (start_at at time zone 'Asia/Bangkok')::date = ${date}::date` : [];
  const nowMin = leadNow(date);
  const byTime = new Map<string, Slot[]>();       // เวลา → ช่างที่ว่างทุกคน
  const all = new Set<number>();
  for (const g of working) {
    const mine = bk.filter((x) => x.staff_code === g.code);
    groomerStarts(g, [], total, nowMin, true).forEach((m) => all.add(m));
    if (mine.length >= g.quota) continue;                 // ครบโควตาวันนี้
    const busy = mine.map((x) => [toMin(x.a), toMin(x.z)] as [number, number]);
    for (const m of groomerStarts(g, busy, total, nowMin)) {
      const k = fromMin(m);
      byTime.set(k, [...(byTime.get(k) ?? []), { start: k, staff: g.code, staff_name: g.display_name }]);
    }
  }
  // น้องที่เลือกมีคิว Grooming อื่นวันนี้แล้ว → เวลาที่ทับกันไม่ให้เลือก
  const petBusy = pets.length ? (await sql`
    select to_char(k.start_at at time zone 'Asia/Bangkok', 'HH24:MI') as a, to_char(k.end_at at time zone 'Asia/Bangkok', 'HH24:MI') as z
    from bookings k join booking_pets bp on bp.booking_code = k.code
    where k.kind = 'slot' and k.status in ${sql(ACTIVE)} and bp.pet_code in ${sql(pets)}
      and (k.start_at at time zone 'Asia/Bangkok')::date = ${date}::date`).map((x) => [toMin(x.a), toMin(x.z)] as [number, number]) : [];
  const clash = (m: number) => petBusy.some(([a, z]) => m < z && m + total > a);
  for (const k of [...byTime.keys()]) if (clash(toMin(k))) byTime.delete(k);
  const slots = [...byTime.values()].map((x) => x[0]).sort((a, z) => a.start.localeCompare(z.start));
  const grid = [...all].sort((a, z) => a - z).map((m) => {
    const free = byTime.get(fromMin(m)) ?? [];
    return { start: fromMin(m), staff: free[0]?.staff ?? null, staff_name: free[0]?.staff_name ?? null,
             free: free.map((f) => ({ staff: f.staff, staff_name: f.staff_name })), ...(clash(m) ? { pet_busy: true } : {}) };
  });
  return { minutes: total, slots, grid, closed: false };
}

// ---------- คิดราคา (server เป็นคนคิดเสมอ หน้าจอแค่แสดง) ----------
export async function quote(customer: string, items: CartItem[]): Promise<Quote> {
  if (!items.length || items.length > 8) throw new BookingError('bad_cart', 'ไม่มีรายการ');
  const out: QuoteItem[] = [];
  for (const it of items) {
    const b = await business(it.business);
    if (b.booking_type !== it.kind) throw new BookingError('wrong_type', 'ชนิดการจองไม่ตรงธุรกิจ');
    await withinWindow(b, it);
    let title = '', when = '', price = 0, start_at = '', end_at = '', firstNight = 0;
    const lines: QuoteLine[] = [];

    if (it.kind === 'stay') {
      const pets = await petsOf(customer, it.pets);
      needVaccine(b, pets, it.from);
      const [u] = await sql`select * from units where code = ${it.unit} and business_code = ${b.code} and active`;
      if (!u) throw new BookingError('unit_invalid', 'ไม่พบห้อง/บ้านนี้');
      const avail = (await stayAvailability(b.code, it.from, it.to, pets.length, it.guests ?? null,
        pets.length ? Math.max(...pets.map((p) => Number(p.weight_kg))) : null)).find((x) => x.code === it.unit);
      if (!avail?.free) throw new BookingError('unit_taken', `${u.name}: ${avail?.reason || 'ไม่ว่าง'}`);
      const nights = daysBetween(it.from, it.to);
      let room = 0, wk = 0;
      for (let i = 0; i < nights; i++) {
        const dow = isoDow(addDays(it.from, i));
        const p = (dow === 5 || dow === 6) && u.weekend_price !== null ? Number(u.weekend_price) : Number(u.price);
        room += p; if (p !== Number(u.price)) wk++;
        if (i === 0) firstNight = p + (pets.length && u.pet_fee ? Number(u.pet_fee) * pets.length : 0);
      }
      lines.push({ label: `${u.name} × ${nights} คืน`, amount: room, note: wk ? `รวมราคาศุกร์–เสาร์ ${wk} คืน` : undefined });
      if (pets.length && u.pet_fee) {
        lines.push({ label: `ค่าน้อง ${pets.length} ตัว × ${nights} คืน`, amount: Number(u.pet_fee) * pets.length * nights });
      }
      title = pets.length ? `${u.name} · ${pets.map((p) => p.name).join(', ')}` : u.name;
      when = `${thRangeDow(it.from, it.to)} · ${nights} คืน`;
      const t = stayTimes(b); start_at = at(it.from, t.in); end_at = at(it.to, t.out);
    }

    if (it.kind === 'session') {
      const pets = await petsOf(customer, it.pets);
      if (!pets.length) throw new BookingError('no_pet', 'เลือกน้องอย่างน้อย 1 ตัว');
      needVaccine(b, pets, it.date);
      const s = (await sessionAvailability(b.code, it.date, pets.map((p) => Number(p.weight_kg)))).find((x) => x.code === it.session);
      if (!s) throw new BookingError('session_invalid', 'ไม่มีรอบนี้ในวันที่เลือก');
      if (!s.free) {
        const code = /ขนาด/.test(s.reason ?? '') ? 'size_mismatch' : /ปิด/.test(s.reason ?? '') ? 'closed_day' : /เลยเวลา/.test(s.reason ?? '') ? 'too_late' : 'session_full';
        throw new BookingError(code, `รอบ ${s.start}: ${s.reason}`);
      }
      const [ps] = await sql`select price from pool_sessions where code = ${it.session}`;
      lines.push({ label: `รอบ ${s.start}–${s.end} × ${pets.length} ตัว`, amount: Number(ps.price) * pets.length });
      title = `สระ ${s.start} · ${pets.map((p) => p.name).join(', ')}`;
      when = thDate(it.date);
      start_at = at(it.date, s.start); end_at = at(it.date, s.end);
    }

    if (it.kind === 'slot') {
      const [pet] = await petsOf(customer, [it.pet]);
      needVaccine(b, [pet], it.start.slice(0, 10));
      const date = it.start.slice(0, 10), time = it.start.slice(11, 16);
      const d = await groomDuration(b.code, it.service, it.addons, pet.tier_code);
      const av = await slotAvailability(b.code, date, it.service, it.addons, pet.tier_code);
      if (av.closed) throw new BookingError('closed_day', 'ร้านปิดวันที่เลือก');
      // ช่างที่เลือกต้องว่างเวลานั้น (เช็กกับคิวจริงอีกครั้งตอนสร้างการจอง)
      const ok = av.slots.some((s) => s.start === time) &&
        (await slotFreeFor(it.staff, date, time, av.minutes));
      if (!ok) throw new BookingError('slot_taken', `เวลา ${time} ไม่ว่างแล้ว`);
      const [tier] = await sql`select label from weight_tiers where code = ${pet.tier_code}`;
      lines.push({ label: `${d.name} (น้อง${tier?.label ?? ''} ${pet.weight_kg} กก.)`, amount: d.price });
      for (const a of d.addons) lines.push({ label: a.name, amount: a.price });
      title = `${d.name} · ${pet.name}`;
      when = `${thDate(date)} · ${time}`;
      start_at = at(date, time); end_at = at(date, fromMin(toMin(time) + av.minutes));
    }

    price = lines.reduce((a, l) => a + l.amount, 0);
    let deposit = depositOf(b, price, firstNight || price), balance = 0, balance_by: string | null = null;
    if (b.balance_days && deposit < price) {
      // ยอดคงเหลือต้องจ่ายออนไลน์ก่อนวันใช้บริการ N วัน · จองใกล้กว่านั้นจ่ายเต็มตอนจอง
      const startD = start_at.slice(0, 10);
      if (daysBetween(todayTH(), startD) <= b.balance_days) deposit = price;   // วันครบกำหนดต้องอยู่หลังวันนี้
      else { balance = price - deposit; balance_by = addDays(startD, -b.balance_days); }
    }
    out.push({ business: b.code, title, when, lines, price, deposit, balance, balance_by, start_at, end_at });
  }
  const total = out.reduce((a, i) => a + i.price, 0);
  const due_now = out.reduce((a, i) => a + i.deposit, 0);
  const balance = out.reduce((a, i) => a + i.balance, 0);
  const balance_by = out.map((i) => i.balance_by).filter((x): x is string => !!x).sort()[0] ?? null;
  return { items: out, total, due_now, balance, balance_by, pay_later: total - due_now - balance };
}

async function slotFreeFor(staff: string, date: string, time: string, minutes: number) {
  const [r] = await sql`
    select not exists (select 1 from bookings k where k.staff_code = ${staff} and k.kind = 'slot' and k.status in ${sql(ACTIVE)}
      and tstzrange(k.start_at, k.end_at, '[)') && tstzrange(${at(date, time)}::timestamptz,
                                                          ${at(date, time)}::timestamptz + make_interval(mins => ${minutes}), '[)')) as ok,
      exists (select 1 from staff where code = ${staff} and is_groomer and ${isoDow(date)} = any (work_days)) as works,
      (select count(*) from bookings k where k.staff_code = ${staff} and k.kind = 'slot' and k.status in ${sql(ACTIVE)}
        and (k.start_at at time zone 'Asia/Bangkok')::date = ${date}::date)
        < (select daily_quota from staff where code = ${staff}) as quota_ok`;
  return r.ok && r.works && r.quota_ok;
}

// จองได้ตั้งแต่วันนี้ถึงล่วงหน้า 2 เดือน · พักไม่เกินจำนวนคืนที่กำหนด · วันเข้า/ออกต้องไม่ใช่วันร้านปิด
async function withinWindow(b: Business, it: CartItem) {
  const today = todayTH(), last = lastBookable(today);
  const first = it.kind === 'stay' ? it.from : it.kind === 'session' ? it.date : it.start.slice(0, 10);
  if (first < today) throw new BookingError('date_past', 'วันที่เลือกผ่านไปแล้ว');
  if (first > last) throw new BookingError('date_too_far', `จองล่วงหน้าได้ไม่เกิน ${BOOK_AHEAD_MONTHS} เดือน`);
  if (it.kind !== 'stay') return;
  const [{ people }] = await sql`select exists (select 1 from units where business_code = ${b.code} and active and max_people is not null) as people`;
  const max = maxNights(people);
  if (daysBetween(it.from, it.to) > max) throw new BookingError('too_long', `พักได้สูงสุด ${max} คืน`);
  const [c] = await sql`select is_closed(${b.code}, null, null, ${it.from}::date) as a, is_closed(${b.code}, null, null, ${it.to}::date) as z`;
  if (c.a) throw new BookingError('closed_day', 'วันเช็กอินร้านปิด');
  if (c.z) throw new BookingError('closed_day', 'วันรับกลับ/เช็กเอาต์ร้านปิด');
}

export { baht };
