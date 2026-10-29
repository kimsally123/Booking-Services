import 'server-only';
import { sql } from './db';
import { canSee, type StaffUser } from './staff';
import { daysBetween } from './thaidate';

// ข้อมูลหลังบ้านที่ใช้หลายหน้า

export interface DayRow {
  code: string; order_code: string; business_code: string; biz: string; color: string | null; booking_type: string;
  kind: string; status: string; order_status: string; price: number; guests: number | null;
  s: string; e: string; unit: string; service: string; staff_code: string | null; staff: string; customer: string; pets: string;
  // คำนวณ
  time: string; title: string; phase: 'start' | 'end' | 'during';
}

export async function dayRows(staff: StaffUser, date: string, biz?: string | null): Promise<DayRow[]> {
  const rows = await sql`
    select k.code, k.order_code, k.business_code, b.name as biz, b.color, b.booking_type, k.kind, k.status, o.status as order_status,
           k.price, k.guests,
           to_char(k.start_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as s,
           to_char(k.end_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as e,
           coalesce(u.name, '') as unit, coalesce(sv.name, '') as service, k.staff_code, coalesce(st.display_name, '') as staff,
           c.display_name as customer,
           coalesce((select string_agg(p.name, ', ' order by p.name) from booking_pets bp join pets p on p.code = bp.pet_code where bp.booking_code = k.code), '') as pets
    from bookings k join orders o on o.code = k.order_code join customers c on c.code = o.customer_code
    join businesses b on b.code = k.business_code
    left join units u on u.code = k.unit_code left join services sv on sv.code = k.service_code left join staff st on st.code = k.staff_code
    where k.status not in ('cancelled', 'expired')
      and (k.start_at at time zone 'Asia/Bangkok')::date <= ${date}::date
      and (k.end_at at time zone 'Asia/Bangkok')::date >= ${date}::date
      and (${biz ?? null}::text is null or k.business_code = ${biz ?? null})
    order by k.start_at`;
  return rows.filter((r) => canSee(staff, r.business_code)).map((r) => {
    const sd = r.s.slice(0, 10), ed = r.e.slice(0, 10);
    const phase: DayRow['phase'] = sd === date ? 'start' : ed === date ? 'end' : 'during';
    const time = phase === 'end' ? r.e.slice(11) : r.s.slice(11);
    const nights = daysBetween(sd, ed);
    const title = r.kind === 'session' ? `รอบ ${r.s.slice(11)}${r.pets ? ' · ' + r.pets : ''}`
      : r.kind === 'slot' ? `${r.service}${r.pets ? ' · ' + r.pets : ''}`
      : r.pets && r.booking_type === 'stay' && !r.guests ? `${r.unit} · ${r.pets}`
      : `${r.unit} · ${nights} คืน`;
    return { ...r, time, title, phase } as DayRow;
  });
}

// งานหน้าร้านถัดไปของการจองนี้ (ปุ่มดำ)
export function nextAction(r: DayRow): [string, string] | null {
  if (r.order_status !== 'paid') return null;
  if (r.kind === 'stay') return r.status === 'confirmed' && r.phase === 'start' ? ['check_in', 'เช็กอิน'] : r.status === 'checked_in' && r.phase !== 'start' ? ['check_out', 'เช็กเอาต์'] : null;
  if (r.kind === 'session') return r.status === 'confirmed' ? ['attend', 'เช็กชื่อ'] : null;
  return r.status === 'confirmed' ? ['start', 'เริ่มทำ'] : r.status === 'in_progress' ? ['finish', 'เสร็จ · แจ้ง'] : null;
}

export async function pendingCounts(staff: StaffUser) {
  const [s] = await sql`
    select count(distinct p.code)::int as slips,
           count(distinct p.code) filter (where p.amount_slip is not null and p.amount_slip <> p.amount_due)::int as flagged
    from payments p join bookings k on k.order_code = p.order_code
    where p.status = 'pending' and (${staff.role} = 'owner' or 'all' = any (${staff.businesses}::text[]) or k.business_code = any (${staff.businesses}::text[]))`;
  const [v] = await sql`select count(*)::int as n from pet_vaccines where status = 'pending'`;
  // รอโอนคืน (ยกเลิก/หมดเวลาหลังได้เงินบางส่วน) · เฉพาะเจ้าของและผู้จัดการ
  const refunds = staff.role === 'staff' ? [] : await sql<{ code: string; amount: string; customer: string }[]>`
    select o.code, o.refund_amount::text as amount, c.display_name as customer from orders o join customers c on c.code = o.customer_code
    where o.refund_status = 'pending' order by o.created_at limit 5`;
  return { slips: s.slips as number, flagged: s.flagged as number, vaccines: v.n as number, refunds };
}

export const isManager = (s: StaffUser) => s.role === 'owner' || s.role === 'manager';
