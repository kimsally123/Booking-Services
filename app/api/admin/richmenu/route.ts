import { NextRequest, NextResponse } from 'next/server';
import { fail } from '@/lib/api';
import { installRichMenus, richMenuStatus } from '@/lib/richmenu';
import { currentStaff } from '@/lib/staff';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET สถานะริชเมนู · POST { first } ติดตั้ง 4 หน้าใหม่ทั้งชุด (เจ้าของเท่านั้น)
async function owner() {
  const s = await currentStaff();
  return s?.role === 'owner' ? s : null;
}
export async function GET() {
  if (!(await owner())) return NextResponse.json({ message: 'เฉพาะเจ้าของร้าน' }, { status: 403 });
  try { return NextResponse.json(await richMenuStatus()); } catch (e) { return fail(e); }
}
export async function POST(req: NextRequest) {
  if (!(await owner())) return NextResponse.json({ message: 'เฉพาะเจ้าของร้าน' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { first?: string };
  try { return NextResponse.json({ ok: true, ...(await installRichMenus(b.first)) }); } catch (e) { return fail(e); }
}
