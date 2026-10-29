import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { sql } from '@/lib/db';
import { verifyIdToken } from '@/lib/line';
import { setStaffCookie } from '@/lib/session';
import { linkStaffMenu } from '@/lib/richmenu';

export const dynamic = 'force-dynamic';

// POST { idToken, token } · token = SETUP_KEY ใน Vercel
// ผูกบัญชี LINE นี้เป็นเจ้าของร้าน · ใช้ได้เฉพาะตอนยังไม่มีเจ้าของคนไหนผูก LINE (หลังจากนั้นใช้ลิงก์เชิญในหลังบ้าน)
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as { idToken?: string; token?: string } | null;
  const key = process.env.SETUP_KEY || '';
  const given = Buffer.from(String(b?.token ?? '')), want = Buffer.from(key);
  if (key.length < 12) return NextResponse.json({ message: 'ยังไม่ได้ตั้ง SETUP_KEY ใน Vercel (อย่างน้อย 12 ตัวอักษร)' }, { status: 400 });
  if (given.length !== want.length || !timingSafeEqual(given, want)) return NextResponse.json({ message: 'ลิงก์ตั้งเจ้าของไม่ถูกต้อง' }, { status: 403 });
  if (!b?.idToken) return NextResponse.json({ message: 'ไม่มีข้อมูลจาก LINE' }, { status: 400 });
  try {
    const u = await verifyIdToken(b.idToken);
    const code = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('owner_setup'))`;
      // บัญชีนี้เป็นเจ้าของอยู่แล้ว → เข้าหลังบ้านเลย
      const [me] = await tx`select code from staff where line_user_id = ${u.sub} and role = 'owner' and invite_status = 'active'`;
      if (me) return me.code as string;
      // มีเจ้าของคนอื่นผูกไว้ (เช่นบัญชีทดลอง/คนละ Provider) · คนที่มี SETUP_KEY = ผู้ดูแล Vercel → ย้ายเจ้าของมาที่บัญชีนี้
      const [has] = await tx`select code from staff where role = 'owner' and invite_status = 'active' and line_user_id is not null order by code limit 1`;
      if (has) {
        await tx`update staff set line_user_id = null where line_user_id = ${u.sub} and code <> ${has.code}`;
        await tx`update staff set line_user_id = ${u.sub}, display_name = coalesce(nullif(${u.name}, ''), display_name) where code = ${has.code}`;
        return has.code as string;
      }
      const [dup] = await tx`select code from staff where line_user_id = ${u.sub}`;
      if (dup) { await tx`update staff set role = 'owner', invite_status = 'active', businesses = array['all']::text[] where code = ${dup.code}`; return dup.code as string; }
      const [row] = await tx`select code from staff where role = 'owner' order by code limit 1`;
      if (row) {
        await tx`update staff set line_user_id = ${u.sub}, invite_status = 'active', invite_token_hash = null, display_name = coalesce(nullif(${u.name}, ''), display_name) where code = ${row.code}`;
        return row.code as string;
      }
      const [{ c }] = await tx`select next_code('ST') as c`;
      await tx`insert into staff (code, display_name, role, businesses, is_groomer, invite_status, line_user_id)
               values (${c}, ${u.name || 'เจ้าของร้าน'}, 'owner', array['all']::text[], false, 'active', ${u.sub})`;
      return c as string;
    });
    await setStaffCookie(code);
    const menu = await linkStaffMenu(u.sub).catch(() => false);
    return NextResponse.json({ ok: true, menu });
  } catch (e) {
    const m = (e as Error).message || '';
    return NextResponse.json({ message: m === 'has_owner' ? 'มีเจ้าของร้านผูก LINE แล้ว · ให้เจ้าของสร้างลิงก์เชิญในหลังบ้าน' : 'ยืนยันตัวตน LINE ไม่สำเร็จ' }, { status: 400 });
  }
}
