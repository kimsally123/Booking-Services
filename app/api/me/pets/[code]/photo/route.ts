import { NextRequest, NextResponse } from 'next/server';
import { BookingError } from '@/lib/booking';
import { fail } from '@/lib/api';
import { setPetPhoto } from '@/lib/pets';
import { currentCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

// multipart: photo (รูปน้อง)
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const c = await currentCustomer();
    if (!c) throw new BookingError('no_login', 'เปิดหน้านี้ผ่าน LINE ของร้าน');
    const f = await req.formData().catch(() => null);
    const file = f?.get('photo');
    if (!file || typeof file === 'string') throw new BookingError('no_file', 'เลือกรูปน้อง');
    return NextResponse.json({ ok: true, photo: await setPetPhoto(c, (await params).code, Buffer.from(await file.arrayBuffer())) });
  } catch (e) { return fail(e); }
}
