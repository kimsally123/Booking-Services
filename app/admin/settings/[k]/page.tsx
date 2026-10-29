import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { canSee, currentStaff } from '@/lib/staff';
import { isManager } from '@/lib/admin';
import Head from '@/components/admin/Head';
import Units from '@/components/admin/set/Units';
import Pool from '@/components/admin/set/Pool';
import Groom from '@/components/admin/set/Groom';
import { Deposit, Hours, Messages, PaySettings, Xsell } from '@/components/admin/set/Rules';
import StaffAdmin from '@/components/StaffAdmin';
import Connect from '@/components/admin/set/Connect';
import RichMenu from '@/components/admin/set/RichMenu';
import { liffId } from '@/lib/config';
import { services } from '@/lib/connect';

export const dynamic = 'force-dynamic';

const TITLE: Record<string, string> = {
  rooms: 'ห้อง Pet hotel', villa: 'หลัง Villa', pool: 'รอบสระ', groom: 'ราคา Grooming', hours: 'เวลาเปิดและวันหยุด',
  deposit: 'มัดจำและยกเลิก', xsell: 'แนะนำข้ามบริการ', msg: 'ข้อความ LINE', pay: 'รับเงินและข้อมูลร้าน', staff: 'พนักงานและสิทธิ์', connect: 'การเชื่อมต่อบริการนอก',
};

export default async function SettingPage({ params }: { params: Promise<{ k: string }> }) {
  const s = await currentStaff();
  if (!s || !isManager(s)) return <div className="warn">เฉพาะเจ้าของและผู้จัดการ</div>;
  const { k } = await params;
  if (!TITLE[k]) notFound();
  const ownerOnly = ['msg', 'pay', 'staff', 'connect'].includes(k);
  if (ownerOnly && s.role !== 'owner') return <><Head back="/admin/settings" cap="ตั้งค่าร้าน" title={TITLE[k]} /><div className="warn">เฉพาะเจ้าของร้าน</div></>;
  const biz = (await sql`select code, name, color, booking_type, open_hours, closed_weekdays, checkin_time, checkout_time, deposit_type, deposit_value, balance_days, guide, cancel_rules, cancel_policy
                         from businesses where active order by sort`).filter((b) => canSee(s, b.code));
  let body: React.ReactNode = null;

  if (k === 'rooms' || k === 'villa') {
    // ที่พักน้อง (Pet hotel) กับที่พักคน (Villa) แยกตามว่าธุรกิจนั้นมีห้องที่ตั้งจำนวนคนไหม
    const stay = await sql`select b.code, exists (select 1 from units u where u.business_code = b.code and u.max_people is not null) as people
                           from businesses b where b.booking_type = 'stay' and b.active order by b.sort`;
    const target = stay.find((b) => b.people === (k === 'villa') && canSee(s, b.code));
    const units = target ? await sql`
      select u.*, coalesce((select json_agg(json_build_object('id', p.id, 'file', p.file, 'is_cover', p.is_cover) order by p.sort) from unit_photos p where p.unit_code = u.code), '[]') as photos
      from units u where u.business_code = ${target.code} order by u.sort, u.code` : [];
    body = target ? <Units units={units as never} biz={target.code} villa={k === 'villa'} /> : <div className="note">ไม่มีธุรกิจนี้ หรือไม่มีสิทธิ์</div>;
  }
  if (k === 'pool') {
    const rounds = await sql`
      select ps.code, ps.unit_code, ps.weekdays, to_char(ps.start_time, 'HH24:MI') as start_time, to_char(ps.end_time, 'HH24:MI') as end_time,
             ps.size_rule, ps.capacity, ps.price, ps.active, u.business_code,
             (select count(*)::int from bookings k where k.session_code = ps.code and k.start_at > now() and k.status in ('holding','confirmed')) as booked
      from pool_sessions ps join units u on u.code = ps.unit_code order by ps.start_time`;
    const [unit] = await sql`select u.code from units u join businesses b on b.code = u.business_code where b.booking_type = 'session' and u.active order by u.sort limit 1`;
    body = <Pool rounds={rounds.filter((r) => canSee(s, r.business_code)) as never} unit={unit?.code ?? ''} />;
  }
  if (k === 'groom') {
    const g = biz.find((b) => b.booking_type === 'slot');
    const services = g ? await sql`
      select s.*, coalesce((select json_agg(json_build_object('tier_code', sp.tier_code, 'price', sp.price, 'duration_min', sp.duration_min)) from service_prices sp where sp.service_code = s.code), '[]') as prices
      from services s where s.business_code = ${g.code} order by s.kind, s.sort, s.code` : [];
    const tiers = await sql`select code, label from weight_tiers order by min_kg`;
    body = g ? <Groom services={services as never} tiers={tiers as never} biz={g.code} /> : <div className="note">ไม่มีธุรกิจแบบช่องเวลา</div>;
  }
  if (k === 'hours') {
    const closures = await sql`
      select c.id, c.business_code, c.unit_code, c.session_code, c.date_from::text, c.date_to::text, c.reason,
             coalesce(u.name, case when ps.code is not null then 'รอบ ' || to_char(ps.start_time, 'HH24:MI') end) as item
      from closures c left join units u on u.code = c.unit_code left join pool_sessions ps on ps.code = c.session_code
      where c.date_to >= current_date order by c.date_from`;
    const items = await sql`
      select u.code, u.name, u.business_code, 'unit' as kind from units u where u.active
      union all select ps.code, 'รอบ ' || to_char(ps.start_time, 'HH24:MI'), u.business_code, 'session' from pool_sessions ps join units u on u.code = ps.unit_code where ps.active`;
    body = <Hours biz={biz as never} closures={closures.filter((c) => canSee(s, c.business_code)) as never} items={items as never} />;
  }
  if (k === 'deposit') {
    const [h] = await sql`select value from settings where key = 'hold_minutes'`;
    body = <Deposit biz={biz as never} hold={Number(h?.value) || 30} isOwner={s.role === 'owner'} />;
  }
  if (k === 'xsell') {
    const rules = await sql`select id, from_business, offer_business, title, when_rule, condition, active from cross_sells order by from_business, sort`;
    body = <Xsell rules={rules.filter((r) => canSee(s, r.from_business)) as never} biz={biz as never} />;
  }
  if (k === 'msg' || k === 'pay') {
    const rows = await sql`select key, value from settings`;
    const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    body = k === 'msg' ? <Messages values={values} /> : <PaySettings values={values} />;
  }
  if (k === 'staff') {
    const [staff, all] = await Promise.all([
      sql`select code, display_name, role, businesses, is_groomer, invite_status, line_user_id is not null as linked, invite_expires > now() as invite_open
          from staff order by invite_status = 'removed', code`,
      sql`select code, name from businesses where active order by sort`,
    ]);
    body = <StaffAdmin me={s.code} staff={[...staff] as never} businesses={[...all] as never} />;
  }
  if (k === 'connect') {
    const ym = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7).replace('-', '');
    const [svcs, rows, cals] = await Promise.all([
      services(),
      sql`select key, value from settings where key in ('ocr_enabled', 'ocr_month_limit', ${'ocr_used_' + ym})`,
      sql`select code, name, calendar_id from businesses where active order by sort`,
    ]);
    const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    body = <Connect svcs={svcs} biz={[...cals] as never}
      ocr={{ on: v.ocr_enabled !== 'off', limit: v.ocr_month_limit ?? '1000', used: Number(v['ocr_used_' + ym] ?? 0) }} />;
    if (s.role === 'owner') body = <>{body}<RichMenu ready={!!process.env.LINE_CHANNEL_ACCESS_TOKEN && !!(await liffId())} /></>;
  }
  return (
    <>
      <Head back="/admin/settings" cap="ตั้งค่าร้าน" title={TITLE[k]} />
      {body}
    </>
  );
}
