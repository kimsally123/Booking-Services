import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { currentStaff } from '@/lib/staff';
import { appUrl, liffId } from '@/lib/config';
import { unlinkStaffMenu } from '@/lib/richmenu';

export const dynamic = 'force-dynamic';

// เจ้าของร้านเท่านั้น
// { action: 'add', display_name, role, businesses[], is_groomer } · { action: 'invite', code } · { action: 'remove', code }
export async function POST(req: NextRequest) {
  const me = await currentStaff();
  if (!me || me.role !== 'owner') return NextResponse.json({ message: 'เฉพาะเจ้าของร้าน' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const code = typeof b.code === 'string' ? b.code : '';
  if (b.action === 'add') {
    const name = String(b.display_name || '').trim().slice(0, 40);
    const role = ['owner', 'manager', 'staff'].includes(String(b.role)) ? String(b.role) : 'staff';
    const biz = Array.isArray(b.businesses) ? (b.businesses as unknown[]).map(String).filter((x) => /^[a-z0-9_]+$/.test(x)) : [];
    if (!name || !biz.length) return NextResponse.json({ message: 'กรอกชื่อและเลือกธุรกิจที่ดูแล' }, { status: 400 });
    const [{ c }] = await sql`select next_code('ST') as c`;
    await sql`insert into staff (code, display_name, role, businesses, is_groomer, work_days, work_start, work_end)
              values (${c}, ${name}, ${role}, ${biz}, ${!!b.is_groomer},
                      ${b.is_groomer ? [2, 3, 4, 5, 6, 7] : null}, ${b.is_groomer ? '10:00' : null}, ${b.is_groomer ? '19:00' : null})`;
    return NextResponse.json({ ok: true, code: c });
  }
  if (b.action === 'invite') {
    const [{ t }] = await sql`select staff_invite(${code}) as t`;
    const liff = await liffId();
    const origin = appUrl() || req.nextUrl.origin;
    // แสดงลิงก์ครั้งเดียว · ฐานข้อมูลเก็บเฉพาะ hash
    return NextResponse.json({ link: liff ? `https://liff.line.me/${liff}/staff/join?t=${t}` : `${origin}/staff/join?t=${t}` });
  }
  if (b.action === 'remove') {
    if (code === me.code) return NextResponse.json({ message: 'ลบตัวเองไม่ได้' }, { status: 400 });
    const [old] = await sql`select line_user_id from staff where code = ${code}`;
    await sql`update staff set invite_status = 'removed', line_user_id = null, invite_token_hash = null where code = ${code}`;
    if (old?.line_user_id) await unlinkStaffMenu(old.line_user_id);   // กลับไปเห็นเมนูลูกค้า
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ message: 'คำสั่งไม่ถูกต้อง' }, { status: 400 });
}
