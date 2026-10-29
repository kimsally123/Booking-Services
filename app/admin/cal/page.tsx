import Empty from '@/components/Empty';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { canSee, currentStaff } from '@/lib/staff';
import { dayRows } from '@/lib/admin';
import { addDays, dowShort, thDate, todayTH, toMin } from '@/lib/thaidate';
import { bizLook } from '@/lib/look';
import Head from '@/components/admin/Head';

export const dynamic = 'force-dynamic';

// ปฏิทิน: กรองธุรกิจ · แถบ 7 วัน · สรุป · ไทม์ไลน์ (Grooming = ตารางช่าง)
export default async function Cal({ searchParams }: { searchParams: Promise<{ date?: string; biz?: string; g?: string }> }) {
  const s = await currentStaff();
  if (!s) return null;
  const sp = await searchParams;
  const today = todayTH();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date || '') ? sp.date! : today;
  const allBiz = (await sql`select code, name, color, booking_type, closed_weekdays from businesses where active order by sort`).filter((b) => canSee(s, b.code));
  const biz = allBiz.find((b) => b.code === sp.biz) ?? null;
  const days = Array.from({ length: 7 }, (_, k) => addDays(date, k));
  const q = (o: Record<string, string | undefined>) => '?' + new URLSearchParams(Object.entries({ date, biz: biz?.code, g: sp.g, ...o }).filter(([, v]) => v) as [string, string][]).toString();

  // จุดสีต่อวัน (มีการจองธุรกิจไหนบ้าง)
  const dots = await sql`
    select d::date::text as d, array_agg(distinct k.business_code) as biz
    from generate_series(${date}::date, ${date}::date + 6, '1 day') d
    join bookings k on k.status not in ('cancelled', 'expired')
      and (k.start_at at time zone 'Asia/Bangkok')::date <= d::date and (k.end_at at time zone 'Asia/Bangkok')::date >= d::date
    group by 1`;
  const closures = await sql`select business_code, unit_code, session_code, date_from::text as f, date_to::text as t from closures where date_to >= ${date}::date`;
  const closedDay = (d: string) => biz && (biz.closed_weekdays.includes(((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1)
    || closures.some((c) => c.business_code === biz.code && !c.unit_code && !c.session_code && d >= c.f && d <= c.t));

  const rows = await dayRows(s, date, biz?.code);
  const look = (c: string) => { const b = allBiz.find((x) => x.code === c)!; return bizLook(c, b?.color ?? null, b?.booking_type ?? ''); };
  const count = (c: string, f: (r: typeof rows[number]) => number) => rows.filter((r) => r.business_code === c).reduce((a, r) => a + f(r), 0);
  const tiles = allBiz.filter((b) => !biz || b.code === biz.code).map((b) => ({
    b, L: look(b.code),
    n: b.booking_type === 'session' ? count(b.code, (r) => (r.pets ? r.pets.split(', ').length : 1)) : count(b.code, () => 1),
    label: b.booking_type === 'session' ? 'ตัวในสระ' : b.booking_type === 'slot' ? 'คิวช่าง' : b.name,
  }));

  // ตารางช่าง (เลือก Grooming)
  const groom = biz?.booking_type === 'slot';
  const staff = groom ? (await sql`select code, display_name, to_char(work_start, 'HH24:MI') as ws, to_char(work_end, 'HH24:MI') as we
                                   from staff where is_groomer and invite_status <> 'removed' and (${biz!.code} = any (businesses) or 'all' = any (businesses)) order by code`) : [];
  const shown = staff.filter((x) => !sp.g || x.code === sp.g);
  const H0 = 9 * 60, H1 = 19 * 60, PX = 44 / 60;   // 1 ชม. = 44px

  return (
    <>
      <Head cap={`${biz ? biz.name + ' · ' : ''}${thDate(date)}${biz ? '' : ' · ทุกธุรกิจ'}`} title="ปฏิทิน" />
      <div className="seg">
        <Link prefetch={false} href={q({ biz: '', g: '' })} className={!biz ? 'on' : ''}>ทั้งหมด</Link>
        {allBiz.map((b) => <Link prefetch={false} key={b.code} href={q({ biz: b.code, g: '' })} className={biz?.code === b.code ? 'on' : ''}>{b.name}</Link>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {days.map((d) => {
          const on = d === date; const cl = closedDay(d); const bz: string[] = dots.find((x) => x.d === d)?.biz ?? [];
          return (
            <Link prefetch={false} key={d} href={q({ date: d })} style={{ borderRadius: 12, padding: '6px 0', textAlign: 'center', background: on ? 'var(--ink)' : cl ? 'repeating-linear-gradient(135deg,#efefec 0 6px,#f7f7f5 6px 12px)' : 'none', color: on ? '#fff' : 'var(--ink)', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
              <small style={{ fontSize: 11, color: on ? '#fff' : [6, 7].includes(((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1) ? 'var(--red)' : 'var(--ink-2)' }}>{dowShort(d)}</small>
              <b style={{ fontSize: 17 }}>{cl ? 'ปิด' : Number(d.slice(8))}</b>
              <span style={{ display: 'flex', gap: 2, height: 5 }}>{bz.filter((c) => !biz || c === biz.code).map((c) => <i key={c} style={{ width: 5, height: 5, borderRadius: 3, background: look(c).border !== 'transparent' ? look(c).border : look(c).bg }} />)}</span>
            </Link>
          );
        })}
      </div>

      {!groom && (
        <div className="tiles" style={{ gridTemplateColumns: `repeat(${Math.min(4, tiles.length)}, 1fr)` }}>
          {tiles.map(({ b, L, n, label }) => (
            <div key={b.code} className="tile" style={{ background: b.booking_type === 'stay' && L.fg === '#fff' ? L.bg : L.border !== 'transparent' ? L.bg : L.bg + '33', color: b.booking_type === 'stay' && L.fg === '#fff' ? '#fff' : 'var(--ink)', boxShadow: L.shadow }}>
              <b className="num">{n}</b><small>{label}</small>
            </div>
          ))}
        </div>
      )}

      {groom ? (
        <>
          <div className="seg">
            <Link prefetch={false} href={q({ g: '' })} className={!sp.g ? 'on' : ''}>ทุกคน</Link>
            {staff.map((x) => <Link prefetch={false} key={x.code} href={q({ g: x.code })} className={sp.g === x.code ? 'on' : ''}>พี่{x.display_name}</Link>)}
          </div>
          {closedDay(date) && <div className="note">ร้านปิดวันนี้</div>}
          <div style={{ display: 'grid', gridTemplateColumns: `44px repeat(${shown.length || 1}, 1fr)`, gap: 6 }}>
            <span />
            {shown.map((x) => <div key={x.code} style={{ textAlign: 'center' }}><b style={{ fontSize: 14 }}>พี่{x.display_name}</b><br /><small className="cap">{rows.filter((r) => r.staff_code === x.code).length} คิว</small></div>)}
            <div style={{ position: 'relative', height: (H1 - H0) * PX }}>
              {Array.from({ length: (H1 - H0) / 60 }, (_, k) => <small key={k} className="cap num" style={{ position: 'absolute', top: k * 60 * PX - 6, fontSize: 11 }}>{String(9 + k).padStart(2, '0')}:00</small>)}
            </div>
            {shown.map((x) => (
              <div key={x.code} style={{ position: 'relative', height: (H1 - H0) * PX, backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${60 * PX}px)` }}>
                {x.ws && toMin(x.ws) > H0 && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: (toMin(x.ws) - H0) * PX, background: 'repeating-linear-gradient(135deg,#efefec 0 6px,#f7f7f5 6px 12px)' }} />}
                {rows.filter((r) => r.staff_code === x.code).map((r) => {
                  const a = toMin(r.s.slice(11)), z = toMin(r.e.slice(11));
                  return (
                    <Link prefetch={false} key={r.code} href={`/admin/b/${r.order_code}`} style={{ position: 'absolute', left: 0, right: 0, top: (a - H0) * PX, height: Math.max(26, (z - a) * PX - 3), background: r.status === 'done' ? '#F4B7BA' : 'var(--red)', color: '#fff', borderRadius: 10, padding: '6px 8px', overflow: 'hidden' }}>
                      <b style={{ fontSize: 13 }}>{r.s.slice(11)} {r.pets}</b><br /><small style={{ fontSize: 11 }}>{r.service}</small>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div>
          {!rows.length && <Empty icon="calendar_month" title="วันนี้ยังว่าง" text="ยังไม่มีงานที่ยืนยันแล้ว · การจองที่สลิปผ่านจะขึ้นในปฏิทินอัตโนมัติ" />}
          {rows.sort((a, b) => a.time.localeCompare(b.time)).map((r) => { const L = look(r.business_code); return (
            <Link prefetch={false} key={r.code + r.phase} href={`/admin/b/${r.order_code}`} className="row">
              <span className="tm num">{r.phase === 'during' ? '' : r.time}</span>
              <i style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: L.border !== 'transparent' ? L.border : L.bg }} />
              <span className="t"><b>{r.biz} · {r.title}</b><small>{r.customer}{r.phase === 'end' ? ' · เช็กเอาต์' : r.phase === 'during' ? ' · พักอยู่' : ''}</small></span>
            </Link>); })}
        </div>
      )}
    </>
  );
}
