import Link from 'next/link';
import { sql } from '@/lib/db';
import { canSee, currentStaff } from '@/lib/staff';
import { baht, thDate, thRange } from '@/lib/thaidate';
import { bizLook } from '@/lib/look';
import { ORDER_ST, Pill } from '@/lib/status';
import Head from '@/components/admin/Head';

export const dynamic = 'force-dynamic';

// การจองทั้งหมด (ล่าสุดก่อน) · กรองตามธุรกิจ
export default async function All({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const s = await currentStaff();
  if (!s) return null;
  const sp = await searchParams;
  const biz = (await sql`select code, name, color, booking_type from businesses where active order by sort`).filter((b) => canSee(s, b.code));
  const f = biz.find((b) => b.code === sp.f)?.code ?? null;
  const q = (sp.q || '').trim().slice(0, 40);
  const rows = await sql`
    select o.code, o.status, o.total, c.display_name as customer,
      (select json_agg(json_build_object('biz', k.business_code, 'item', coalesce(u.name, sv.name, ''), 'pets',
              coalesce((select string_agg(p.name, ', ') from booking_pets bp join pets p on p.code = bp.pet_code where bp.booking_code = k.code), ''),
              's', (k.start_at at time zone 'Asia/Bangkok')::date::text, 'e', (k.end_at at time zone 'Asia/Bangkok')::date::text, 'kind', k.kind) order by k.start_at)
       from bookings k left join units u on u.code = k.unit_code left join services sv on sv.code = k.service_code where k.order_code = o.code) as items
    from orders o join customers c on c.code = o.customer_code
    where (${f}::text is null or exists (select 1 from bookings k where k.order_code = o.code and k.business_code = ${f}))
      and (${q} = '' or o.code ilike ${'%' + q + '%'} or c.display_name ilike ${'%' + q + '%'} or c.phone like ${'%' + q + '%'})
    order by o.created_at desc limit 100`;
  const list = rows.filter((r) => (r.items ?? []).some((i: { biz: string }) => canSee(s, i.biz)));
  const look = (c: string) => { const b = biz.find((x) => x.code === c); return bizLook(c, b?.color ?? null, b?.booking_type ?? ''); };
  return (
    <>
      <Head back="/admin/menu" cap={`${list.length} รายการ`} title="การจองทั้งหมด" />
      <div className="seg">
        <Link prefetch={false} href="?" className={!f ? 'on' : ''}>ทั้งหมด</Link>
        {biz.map((b) => <Link prefetch={false} key={b.code} href={`?f=${b.code}`} className={f === b.code ? 'on' : ''}>{b.name}</Link>)}
      </div>
      <form><input className="input" name="q" defaultValue={q} placeholder="ค้นหา ชื่อ · เบอร์ · รหัสจอง" />{f && <input type="hidden" name="f" value={f} />}</form>
      <div>
        {list.map((o) => { const i = o.items[0]; const L = look(i.biz); return (
          <Link prefetch={false} key={o.code} href={`/admin/b/${o.code}`} className="row" style={{ alignItems: 'flex-start' }}>
            <span className="t">
              <span className="biztag" style={{ background: L.bg, color: L.fg, boxShadow: L.shadow }}>{biz.find((b) => b.code === i.biz)?.name}</span>
              <b>{o.customer} · {i.item}{i.pets ? ` · ${i.pets}` : ''} {i.s !== i.e ? thRange(i.s, i.e) : thDate(i.s)}{o.items.length > 1 ? ` +${o.items.length - 1}` : ''}</b>
              <small className="num">{o.code} · {baht(o.total)}</small>
            </span>
            <Pill s={o.status === 'pending_review' ? ['รอร้านตรวจสลิป', '#FDF5DC', '#8A5A00'] : ORDER_ST[o.status]} />
          </Link>); })}
      </div>
    </>
  );
}
