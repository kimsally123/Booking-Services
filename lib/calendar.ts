import 'server-only';
import { sql } from './db';
import { BookingError, groomers, groomerStarts, groomMinutes, leadNow } from './booking';
import { addDays, dowFull, isoDow, toMin, todayTH } from './thaidate';
import { lastBookable, lastShown } from './rules';

// ปฏิทินรายเดือน: ข้อมูลที่ว่างของทุกวันในช่วงที่แสดง (วันนี้ → สิ้นเดือนที่ 3) ในครั้งเดียว
// หน้าจอใช้ข้อมูลนี้ขึ้น "ว่าง n" / "n รอบ" / "เต็ม" / ขีดฆ่าวันปิด · ตอนจองจริง server ตรวจซ้ำอีกรอบ
const ACTIVE = ['holding', 'confirmed', 'checked_in', 'in_progress'];

export type DayInfo = { closed: boolean; reason: string | null };
export type MonthData = {
  today: string; last: string; until: string;
  days: Record<string, DayInfo>;
  units?: { code: string; price: number; weekend_price: number | null; busy: string[]; off: string[] }[];
  sessions?: Record<string, { open: number; later: number; free: number }>;
  slots?: Record<string, { free: number; staff?: number; reason: string | null }>;
};

export async function monthAvailability(bizCode: string, opt: { service?: string; addons?: string[]; tier?: string | null }): Promise<MonthData> {
  const [b] = await sql`select code, name, booking_type, closed_weekdays from businesses where code = ${bizCode} and active`;
  if (!b) throw new BookingError('business_not_found', 'ไม่พบธุรกิจนี้');
  const today = todayTH(), last = lastBookable(today), until = lastShown(today);

  // วันที่ร้านปิดทั้งธุรกิจ: ปิดประจำสัปดาห์ หรือวันพิเศษ "ปิดร้าน"
  const dayRows = await sql`
    select to_char(d, 'YYYY-MM-DD') as day,
           extract(isodow from d)::int = any (${b.closed_weekdays ?? []}::smallint[]) as weekly,
           (select coalesce(c.reason, '') from closures c
             where c.business_code = ${bizCode} and d::date between c.date_from and c.date_to
               and c.unit_code is null and c.session_code is null limit 1) as closure
    from generate_series(${today}::date, ${until}::date, '1 day') d`;
  const days: Record<string, DayInfo> = {};
  for (const r of dayRows) {
    const closed = r.weekly || r.closure !== null;
    days[r.day] = {
      closed,
      reason: !closed ? null : r.weekly ? `${b.name} ปิดทุกวัน${dowFull(r.day)}` : r.closure || 'ร้านปิดวันพิเศษ',
    };
  }
  const out: MonthData = { today, last, until, days };

  if (b.booking_type === 'stay') {
    // ต่อห้อง: คืนที่มีคนจอง (busy) และคืนที่ร้านปิดขาย (off) · ห้องที่ปิดขาย (active = false) ไม่นับ
    const rows = await sql`
      select u.code, u.price, u.weekend_price,
        coalesce((select array_agg(distinct to_char(g, 'YYYY-MM-DD'))
                  from bookings k, generate_series((k.start_at at time zone 'Asia/Bangkok')::date,
                                                   (k.end_at at time zone 'Asia/Bangkok')::date - 1, '1 day') g
                  where k.unit_code = u.code and k.kind = 'stay' and k.status in ${sql(ACTIVE)}
                    and k.end_at > ${today}::date and g::date between ${today}::date and ${until}::date), '{}') as busy,
        coalesce((select array_agg(distinct to_char(g, 'YYYY-MM-DD'))
                  from closures c, generate_series(greatest(c.date_from, ${today}::date), least(c.date_to, ${until}::date), '1 day') g
                  where c.business_code = u.business_code and c.session_code is null
                    and (c.unit_code is null or c.unit_code = u.code)), '{}') as off
      from units u where u.business_code = ${bizCode} and u.active order by u.sort, u.code`;
    out.units = rows.map((r) => ({ code: r.code, price: Number(r.price), weekend_price: r.weekend_price === null ? null : Number(r.weekend_price),
                                   busy: r.busy, off: r.off }));
  }

  if (b.booking_type === 'session') {
    // ต่อวัน: รอบที่เปิดวันนั้น / รอบที่ยังมีที่ว่าง (ไม่ปิด · ยังไม่เลยเวลา · ยังไม่เต็ม)
    const rows = await sql`
      select to_char(d, 'YYYY-MM-DD') as day, count(*)::int as open,
        count(*) filter (where ((d::date + s.start_time) at time zone 'Asia/Bangkok') > now())::int as later,
        count(*) filter (where not is_closed(${bizCode}, s.unit_code, s.code, d::date)
                           and ((d::date + s.start_time) at time zone 'Asia/Bangkok') > now()
                           and session_left(s.code, (d::date + s.start_time) at time zone 'Asia/Bangkok') > 0)::int as free
      from generate_series(${today}::date, ${until}::date, '1 day') d
      join pool_sessions s on extract(isodow from d)::int = any (s.weekdays)
      join units u on u.code = s.unit_code
      where u.business_code = ${bizCode} and s.active and u.active
      group by d`;
    out.sessions = Object.fromEntries(rows.map((r) => [r.day, { open: r.open, later: r.later, free: r.free }]));
  }

  if (b.booking_type === 'slot') {
    // ต่อวัน: จำนวนเวลาที่ยังมีช่างว่าง (ต้องรู้บริการก่อน เพราะเวลาที่ใช้ต่างกัน)
    const total = opt.service ? await groomMinutes(bizCode, opt.service, opt.addons ?? [], opt.tier ?? null) : 60;
    const gs = await groomers(bizCode);
    const bk = gs.length ? await sql`
      select staff_code, to_char(start_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD') as day,
             to_char(start_at at time zone 'Asia/Bangkok', 'HH24:MI') as a, to_char(end_at at time zone 'Asia/Bangkok', 'HH24:MI') as z
      from bookings where kind = 'slot' and status in ${sql(ACTIVE)} and staff_code in ${sql(gs.map((g) => g.code))}
        and start_at >= ${today}::date and start_at < ${addDays(until, 1)}::date` : [];
    const slots: MonthData['slots'] = {};
    for (let d = today; d <= until; d = addDays(d, 1)) {
      if (days[d]?.closed) continue;
      const working = gs.filter((g) => g.work_days.includes(isoDow(d)));
      if (!working.length) { slots[d] = { free: 0, reason: 'ช่างหยุดทุกคนวันนี้' }; continue; }
      const times = new Set<number>();
      let quotaFull = 0, staffFree = 0;
      for (const g of working) {
        const mine = bk.filter((x) => x.staff_code === g.code && x.day === d);
        if (mine.length >= g.quota) { quotaFull++; continue; }
        const st = groomerStarts(g, mine.map((x) => [toMin(x.a), toMin(x.z)] as [number, number]), total, leadNow(d));
        if (st.length) staffFree++;
        st.forEach((m) => times.add(m));
      }
      const late = !times.size && working.every((g) => !groomerStarts(g, [], total, leadNow(d), true).length);
      slots[d] = { free: times.size, staff: staffFree, reason: times.size ? null : late ? 'วันนี้เลยเวลารับคิวแล้ว'
        : quotaFull === working.length ? 'คิวช่างเต็มแล้ววันนี้' : 'ทุกเวลามีคนจองแล้ว' };
    }
    out.slots = slots;
  }
  return out;
}
