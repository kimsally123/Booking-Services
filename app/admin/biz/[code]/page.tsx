import Empty from '@/components/Empty';
import Link from 'next/link';
import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { canSee, currentStaff } from '@/lib/staff';
import { dayRows, isManager, nextAction } from '@/lib/admin';
import { addDays, dowShort, thDate, todayTH } from '@/lib/thaidate';
import Head from '@/components/admin/Head';
import ActBtn from '@/components/admin/ActBtn';
import CloseRound from '@/components/admin/CloseRound';

export const dynamic = 'force-dynamic';

const SET: Record<string, [string, string][]> = {
  stay: [['ห้องและราคา', 'units'], ['วันรับเข้า', 'hours'], ['มัดจำ', 'deposit']],
  session: [['รอบสระ', 'pool'], ['วันและเวลาเปิด', 'hours'], ['มัดจำ', 'deposit']],
  slot: [['บริการและราคา', 'groom'], ['วันและเวลาเปิด', 'hours'], ['มัดจำ', 'deposit']],
};

// หน้าของแต่ละธุรกิจ
export default async function Biz({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ grid?: string }> }) {
  const s = await currentStaff();
  if (!s) return null;
  const { code } = await params;
  const sp = await searchParams;
  const [b] = await sql`select * from businesses where code = ${code}`;
  if (!b || !canSee(s, code)) notFound();
  const today = todayTH();
  const rows = (await dayRows(s, today, code)).sort((x, y) => x.time.localeCompare(y.time));
  const ICON: Record<string, string> = { units: 'bed', hours: 'schedule', deposit: 'gavel', pool: 'pool', groom: 'content_cut' };
  // ตารางห้อง 7 วัน
  const grid = b.booking_type === 'stay' && sp.grid === '1';
  const days = Array.from({ length: 7 }, (_, k) => addDays(today, k));
  const units = grid ? await sql`select code, name from units where business_code = ${code} and active order by sort` : [];
  const occ = grid ? await sql`
    select k.unit_code, d::date::text as d, k.status from generate_series(${today}::date, ${today}::date + 6, '1 day') d
    join bookings k on k.business_code = ${code} and k.status not in ('cancelled', 'expired')
      and (k.start_at at time zone 'Asia/Bangkok')::date <= d::date and (k.end_at at time zone 'Asia/Bangkok')::date > d::date` : [];
  const [{ people }] = await sql`select exists (select 1 from units where business_code = ${code} and max_people is not null) as people`;
  const kind = b.booking_type === 'stay' ? (people ? 'villa' : 'rooms') : null;
  // สระ: รอบวันนี้ (จองแล้ว/รับได้) + ปิดรอบฉุกเฉิน
  const rounds = b.booking_type === 'session' ? await sql`
    select s.code, to_char(s.start_time, 'HH24:MI') as a, to_char(s.end_time, 'HH24:MI') as z, s.capacity, s.size_rule,
           s.capacity - session_left(s.code, (${today}::date + s.start_time) at time zone 'Asia/Bangkok') as booked,
           is_closed(${code}, s.unit_code, s.code, ${today}::date) as closed
    from pool_sessions s join units u on u.code = s.unit_code
    where u.business_code = ${code} and s.active and u.active and extract(isodow from ${today}::date)::int = any (s.weekdays)
    order by s.start_time` : [];
  return (
    <>
      <Head back="/admin/menu" cap={`วันนี้ · ${thDate(today)}`} title={b.name} />
      {isManager(s) && (
        <div className="seg">
          {SET[b.booking_type].map(([l, k]) => (
            <Link key={k} href={`/admin/settings/${k === 'units' ? (kind ?? 'rooms') : k}?biz=${code}`} style={{ gap: 6 }}><span className="ms" style={{ fontSize: 18 }}>{ICON[k]}</span>{l}</Link>
          ))}
        </div>
      )}
      {b.booking_type === 'stay' && <Link href={grid ? `?` : `?grid=1`} className="btnw line" style={{ height: 44 }}><span className="ms">calendar_month</span>{grid ? 'ซ่อนตาราง' : `ดูตาราง${people ? 'บ้าน' : 'ห้อง'} 7 วัน`}</Link>}
      {grid && (
        <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(7, 1fr)`, gap: 3, fontSize: 12 }}>
          <span />{days.map((d) => <b key={d} style={{ textAlign: 'center' }}>{dowShort(d)}<br />{Number(d.slice(8))}</b>)}
          {units.map((u) => (<Fragment key={u.code}>
            <span style={{ fontWeight: 700, alignSelf: 'center' }}>{u.name}</span>
            {days.map((d) => { const o = occ.find((x) => x.unit_code === u.code && x.d === d); return <span key={u.code + d} style={{ height: 28, borderRadius: 6, background: !o ? 'var(--soft)' : o.status === 'holding' ? 'var(--amber-soft)' : 'var(--ink)' }} />; })}
          </Fragment>))}
        </div>
      )}
      {b.booking_type === 'session' && <>
        <div className="grp">รอบวันนี้<span>{rounds.length} รอบ</span></div>
        {!rounds.length && <div className="note">วันนี้ไม่มีรอบ</div>}
        {rounds.map((r) => (
          <div key={r.code} className="row" style={{ alignItems: 'center' }}>
            <span className="tm num">{r.a}</span>
            <span className="t"><b className="num">{r.a}–{r.z}</b><small>{r.closed ? 'ปิดรอบแล้ว' : `จองแล้ว ${r.booked}/${r.capacity} ตัว`}</small></span>
            {!r.closed && isManager(s) && <CloseRound biz={code} session={r.code} date={today} label={`${r.a}–${r.z}`} />}
          </div>
        ))}
      </>}
      <div className="grp">ที่ยืนยันแล้ว<span>{rows.length} รายการวันนี้</span></div>
      {!rows.length && <Empty icon="event" title="ยังไม่มีการจองที่ยืนยันแล้ว" text="การจองที่รอตรวจสลิปอยู่ในแท็บสลิป · ผ่านแล้วจะย้ายมาที่นี่" />}
      <div>
        {rows.map((r) => { const a = nextAction(r); return (
          <Link key={r.code + r.phase} href={`/admin/b/${r.order_code}`} className="row">
            <span className="tm num">{r.phase === 'during' ? '' : r.time}</span>
            <span className="t"><b>{r.title}</b><small>{r.customer}{r.phase === 'end' ? ' · เช็กเอาต์' : r.phase === 'during' ? ' · พักอยู่' : ''}{r.order_status !== 'paid' ? ' · รอสลิป' : ''}</small></span>
            {a && <ActBtn code={r.code} action={a[0]} label={a[1]} />}
          </Link>); })}
      </div>
    </>
  );
}
