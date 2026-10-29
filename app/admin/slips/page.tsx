import Empty from '@/components/Empty';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { canSee, currentStaff } from '@/lib/staff';
import { signedUrl } from '@/lib/storage';
import { baht, thRange, thDate } from '@/lib/thaidate';
import { bizLook } from '@/lib/look';
import Head from '@/components/admin/Head';

export const dynamic = 'force-dynamic';

// ตรวจสลิป: ใบที่ยอดไม่ตรงขึ้นก่อน
export default async function Slips() {
  const s = await currentStaff();
  if (!s) return null;
  const rows = await sql`
    select p.code, p.amount_due, p.amount_slip, p.slip_file, c.display_name as customer,
           (select json_agg(json_build_object('biz', b.code, 'name', b.name, 'color', b.color, 'type', b.booking_type, 'item', coalesce(u.name, sv.name, ''),
                    's', (k.start_at at time zone 'Asia/Bangkok')::date::text, 'e', (k.end_at at time zone 'Asia/Bangkok')::date::text) order by k.start_at)
              from bookings k join businesses b on b.code = k.business_code
              left join units u on u.code = k.unit_code left join services sv on sv.code = k.service_code where k.order_code = p.order_code) as items
    from payments p join orders o on o.code = p.order_code join customers c on c.code = o.customer_code
    where p.status = 'pending'
    order by (p.amount_slip is not null and p.amount_slip <> p.amount_due) desc, p.created_at`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: any[] = await Promise.all(rows.filter((r) => (r.items ?? []).some((i: { biz: string }) => canSee(s, i.biz)))
    .map(async (r) => ({ ...(r as Record<string, any>), url: await signedUrl("slips", r.slip_file) })));
  return (
    <>
      <Head cap="ใบที่มีธงขึ้นก่อน" title="ตรวจสลิป" />
      {!list.length && <Empty tone="green" icon="task_alt" title="ตรวจสลิปครบแล้ว" text="สลิปใหม่จะขึ้นที่นี่ทันทีที่ลูกค้าแนบ และแจ้งเตือนในแชทร้าน" />}
      <div>
        {list.map((r) => {
          const i = r.items[0]; const L = bizLook(i.biz, i.color, i.type);
          const bad = r.amount_slip !== null && Number(r.amount_slip) !== Number(r.amount_due);
          return (
            <Link prefetch={false} key={r.code} href={`/admin/slips/${r.code}`} className="row" style={{ alignItems: 'flex-start' }}>
              <span className="photo" style={{ width: 56, height: 72, flex: 'none' }}>{r.url ? <img src={r.url} alt="" /> : null}</span>
              <span className="t">
                <span style={{ display: 'flex', gap: 4 }}>
                  <span className="biztag" style={{ background: L.bg, color: L.fg, boxShadow: L.shadow }}>{i.name}</span>
                  {bad && <span className="biztag" style={{ background: 'var(--red-ink)', color: '#fff' }}>ยอดไม่ตรง</span>}
                </span>
                <b>{r.customer} · {i.item} {i.s !== i.e ? thRange(i.s, i.e) : thDate(i.s)}{r.items.length > 1 ? ` +${r.items.length - 1}` : ''}</b>
                <span style={{ fontSize: 14 }}>ควรได้ <b>{baht(r.amount_due)}</b>{r.amount_slip !== null && <> · สลิป <b style={{ color: bad ? 'var(--red-ink)' : undefined }}>{baht(r.amount_slip)}</b></>}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
