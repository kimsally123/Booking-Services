import Link from 'next/link';
import { sql } from '@/lib/db';
import { canSee, currentStaff } from '@/lib/staff';
import { dayRows, isManager } from '@/lib/admin';
import { todayTH } from '@/lib/thaidate';
import { bizLook } from '@/lib/look';
import Head from '@/components/admin/Head';
import LogoutButton from '@/components/LogoutButton';

export const dynamic = 'force-dynamic';
const ROLE: Record<string, string> = { owner: 'เจ้าของ', manager: 'ผู้จัดการ', staff: 'หน้าร้าน' };

export default async function Menu() {
  const s = await currentStaff();
  if (!s) return null;
  const today = todayTH();
  const [biz, rows, [cust]] = await Promise.all([
    sql`select code, name, color, booking_type from businesses where active order by sort`,
    dayRows(s, today),
    sql`select count(*)::int as n from customers`,
  ]);
  const Ico = ({ ic, bg, fg, sh }: { ic: string; bg: string; fg: string; sh?: string }) => (
    <span style={{ width: 40, height: 40, borderRadius: 10, background: bg, color: fg, boxShadow: sh, display: 'grid', placeItems: 'center', flex: 'none' }}><span className="ms">{ic}</span></span>
  );
  return (
    <>
      <Head cap={`${s.display_name} · ${ROLE[s.role]}`} title="เมนู" />
      <div className="list">
        {biz.filter((b) => canSee(s, b.code)).map((b) => { const L = bizLook(b.code, b.color, b.booking_type); const n = rows.filter((r) => r.business_code === b.code).length; return (
          <Link prefetch={false} key={b.code} href={`/admin/biz/${b.code}`} className="li"><Ico ic={L.icon} bg={L.bg} fg={L.fg} sh={L.shadow} />
            <span className="t"><b>{b.name}</b><small>{n} รายการวันนี้</small></span><span className="ms go">chevron_right</span></Link>); })}
        <Link prefetch={false} href="/admin/all" className="li"><Ico ic="list_alt" bg="var(--soft)" fg="var(--ink)" /><span className="t"><b>การจองทั้งหมด</b><small>ทุกธุรกิจ · ทุกสถานะ</small></span><span className="ms go">chevron_right</span></Link>
        <Link prefetch={false} href="/admin/customers" className="li"><Ico ic="group" bg="var(--soft)" fg="var(--ink)" /><span className="t"><b>ลูกค้าและน้อง</b><small>{cust.n} คน</small></span><span className="ms go">chevron_right</span></Link>
        <Link prefetch={false} href="/admin/vaccines" className="li"><Ico ic="vaccines" bg="var(--soft)" fg="var(--ink)" /><span className="t"><b>วัคซีนรอตรวจ</b><small>ตรวจสมุดวัคซีนที่ลูกค้าส่ง</small></span><span className="ms go">chevron_right</span></Link>
        {isManager(s) && <Link prefetch={false} href="/admin/settings" className="li"><Ico ic="tune" bg="var(--soft)" fg="var(--ink)" /><span className="t"><b>ตั้งค่าร้าน</b><small>ห้อง · ราคา · รอบสระ</small></span><span className="ms go">chevron_right</span></Link>}
        <div className="li"><Ico ic="logout" bg="#FDE8E9" fg="var(--red-ink)" /><span className="t"><b>ออกจากระบบ</b><small>{s.display_name} · {ROLE[s.role]}</small></span><LogoutButton /></div>
      </div>
    </>
  );
}
