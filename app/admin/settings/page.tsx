import Link from 'next/link';
import { sql } from '@/lib/db';
import { currentStaff } from '@/lib/staff';
import { isManager } from '@/lib/admin';
import Head from '@/components/admin/Head';

export const dynamic = 'force-dynamic';

// ตั้งค่าร้าน (กลุ่มตามโปรโตไทป์) · รายการเฟส 2 แสดงไว้แต่ยังกดไม่ได้
export default async function Settings() {
  const s = await currentStaff();
  if (!s || !isManager(s)) return <div className="warn">เฉพาะเจ้าของและผู้จัดการ</div>;
  const [[c]] = await Promise.all([sql`select
      (select count(*)::int from units u join businesses b on b.code = u.business_code where b.booking_type = 'stay' and u.max_people is null and u.active) as rooms,
      (select count(*)::int from units u where u.max_people is not null and u.active) as villas,
      (select count(*)::int from pool_sessions where active) as rounds,
      (select count(*)::int from services where kind = 'main' and active) as groom,
      (select count(*)::int from closures where date_to >= current_date) as closures,
      (select count(*)::int from cross_sells where active) as xsell,
      (select count(*)::int from staff where invite_status <> 'removed') as staff`]);
  const G: [string, [string, string, string, string?, boolean?][]][] = [
    ['ขายอะไร', [['bed', 'ห้อง Pet hotel', 'rooms', `${c.rooms} ห้อง`], ['cottage', 'หลัง Villa', 'villa', `${c.villas} หลัง`], ['pool', 'รอบสระ', 'pool', `${c.rounds} รอบ`], ['content_cut', 'ราคา Grooming', 'groom', `${c.groom} บริการ`]]],
    ['ราคาและกติกา', [['schedule', 'เวลาเปิดและวันหยุด', 'hours', c.closures ? `${c.closures} วันพิเศษ` : ''], ['gavel', 'มัดจำและยกเลิก', 'deposit']]],
    ['ขายเพิ่ม', [['shopping_cart', 'แนะนำข้ามบริการ', 'xsell', `${c.xsell} กฎ`], ['confirmation_number', 'บัตรสระและคูปอง', '', 'เฟส 2', true]]],
    ['ร้านและคน', [['chat', 'ข้อความ LINE', 'msg'], ['account_balance', 'รับเงินและข้อมูลร้าน', 'pay'], ['group', 'พนักงานและสิทธิ์', 'staff', `${c.staff} คน`], ['tune', 'การเชื่อมต่อบริการนอก', 'connect'], ['store', 'สาขา', '', 'เฟส 2', true], ['bar_chart', 'รายงาน', '', 'เฟส 2', true]]],
  ];
  return (
    <>
      <Head back="/admin/menu" cap={s.role === 'owner' ? 'เจ้าของร้าน' : 'ผู้จัดการ'} title="ตั้งค่าร้าน" />
      {G.map(([g, rows]) => (
        <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="cap">{g}</span>
          <div className="list">
            {rows.map(([ic, l, k, v, lock]) => lock
              ? <div key={l} className="li" style={{ opacity: 0.5 }}><span className="ms">{ic}</span><span className="t"><span style={{ fontSize: 16 }}>{l}</span></span><span className="cap">{v}</span><span className="ms go">lock</span></div>
              : <Link key={k} href={`/admin/settings/${k}`} className="li"><span className="ms">{ic}</span><span className="t"><span style={{ fontSize: 16 }}>{l}</span></span>{v && <span className="cap">{v}</span>}<span className="ms go">chevron_right</span></Link>)}
          </div>
        </div>
      ))}
    </>
  );
}
