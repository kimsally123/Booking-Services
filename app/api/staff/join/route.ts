import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verifyIdToken } from '@/lib/line';
import { setStaffCookie } from '@/lib/session';
import { linkStaffMenu } from '@/lib/richmenu';

export const dynamic = 'force-dynamic';

// POST { idToken, token } → ใช้ลิงก์เชิญ ผูก LINE กับพนักงาน
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as { idToken?: string; token?: string } | null;
  if (!b?.idToken || !b.token || !/^[0-9a-f]{64}$/.test(b.token)) return NextResponse.json({ message: 'ลิงก์เชิญไม่ถูกต้อง' }, { status: 400 });
  try {
    const u = await verifyIdToken(b.idToken);
    const [{ code }] = await sql`select staff_accept(${b.token}, ${u.sub}) as code`;
    await setStaffCookie(code);
    // เปลี่ยนริชเมนูในแชทของคนนี้เป็นเมนูพนักงาน (ยังไม่ได้ติดตั้งริชเมนู = ข้าม)
    const menu = await linkStaffMenu(u.sub).catch((err) => { console.error('staff menu', (err as Error).message); return false; });
    return NextResponse.json({ ok: true, menu });
  } catch (e) {
    const m = (e as Error).message || '';
    const dup = (e as { code?: string }).code === '23505';
    return NextResponse.json({ message: /invite_invalid/.test(m) ? 'ลิงก์เชิญหมดอายุหรือใช้ไปแล้ว ขอลิงก์ใหม่จากเจ้าของร้าน'
      : dup ? 'บัญชี LINE นี้ผูกกับพนักงานคนอื่นแล้ว' : 'ยืนยันตัวตน LINE ไม่สำเร็จ' }, { status: 400 });
  }
}
