import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { currentStaff } from '@/lib/staff';
import { baht, thDate, todayTH } from '@/lib/thaidate';
import { vaxState } from '@/lib/vax';
import { ORDER_ST, Pill } from '@/lib/status';
import Head from '@/components/admin/Head';
import { Photo } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function Customer({ params }: { params: Promise<{ code: string }> }) {
  const s = await currentStaff();
  if (!s) return null;
  const { code } = await params;
  const [c] = await sql`select * from customers where code = ${code}`;
  if (!c) notFound();
  const today = todayTH();
  const [pets, orders] = await Promise.all([
    sql`select p.code, p.name, p.breed, p.weight_kg, p.tags, p.note,
          coalesce((select json_agg(json_build_object('status', v.status, 'expires_on', v.expires_on::text)) from pet_vaccines v where v.pet_code = p.code), '[]') as vaccines
        from pets p where p.customer_code = ${code} order by p.created_at`,
    sql`select o.code, o.status, o.total, (o.created_at at time zone 'Asia/Bangkok')::date::text as d from orders o where o.customer_code = ${code} order by o.created_at desc limit 20`,
  ]);
  const paid = orders.filter((o) => o.status === 'paid');
  return (
    <>
      <Head back="/admin/customers" cap="ลูกค้าและน้อง" title={c.display_name} />
      <div className="tiles" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="tile" style={{ background: 'var(--soft)' }}><small>การจองที่ยืนยัน</small><b>{paid.length} ครั้ง</b></div>
        <div className="tile" style={{ background: 'var(--soft)' }}><small>ยอดรวม</small><b className="num">{baht(paid.reduce((a, o) => a + Number(o.total), 0))}</b></div>
      </div>
      <div className="stat"><span>เบอร์</span><b className="num">{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : '-'}</b></div>
      <div className="stat"><span>ความยินยอม</span><b style={{ fontSize: 13 }}>{c.pdpa_at ? `ยอมรับแล้ว · ข่าว ${c.consent_news ? 'รับ' : 'ไม่รับ'} · โพสต์รูป ${c.consent_photo ? 'ได้' : 'ไม่ได้'}` : 'ยังไม่ยอมรับ'}</b></div>
      {c.delete_requested_at && <div className="err">ลูกค้าขอลบข้อมูล · เคลียร์การจองที่ค้างแล้วลบ และแจ้งลูกค้า</div>}
      <div className="grp">น้อง · {pets.length} ตัว</div>
      {pets.map((p) => { const v = vaxState(p.vaccines, today); return (
        <div key={p.code} className="row">
          <Photo h={48} label="" />
          <span className="t"><b>{p.name}</b><small>{[p.breed, `${p.weight_kg} กก.`].filter(Boolean).join(' · ')}</small>
            {(p.tags.length > 0 || p.note) && <small style={{ color: 'var(--red-ink)', fontWeight: 700 }}>⚠ {[...p.tags, p.note].filter(Boolean).join(' · ')}</small>}</span>
          <span className="pill" style={{ background: v[1], color: v[2] }}>{v[0].replace(' · ร้านตรวจแล้ว', ' ✓')}</span>
        </div>); })}
      <div className="grp">การจอง</div>
      {orders.map((o) => (
        <Link prefetch={false} key={o.code} href={`/admin/b/${o.code}`} className="row">
          <span className="t"><b className="num">{o.code}</b><small>{thDate(o.d)} · {baht(o.total)}</small></span>
          <Pill s={o.status === 'pending_review' ? ['รอตรวจสลิป', '#FDF5DC', '#8A5A00'] : ORDER_ST[o.status]} />
        </Link>
      ))}
    </>
  );
}
