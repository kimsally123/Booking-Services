import { NextRequest, NextResponse, after } from 'next/server';
import { sendDue } from '@/lib/notify';
import { BookingError } from '@/lib/booking';
import { fail } from '@/lib/api';
import { createOrder } from '@/lib/orders';
import { currentCustomer } from '@/lib/session';
import { sql } from '@/lib/db';
import type { CartItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

// POST { items, accept } → สร้างทริป + กันที่ · ตอบรหัสทริปเพื่อไปหน้าจ่าย
export async function POST(req: NextRequest) {
  // ส่งอีเมล/ปฏิทิน/LINE ที่ค้างหลังตอบลูกค้าแล้ว (ไม่ทำให้หน้าเว็บช้า)
  after(() => sendDue(10).catch(() => undefined));
  try {
    const customer = await currentCustomer();
    if (!customer) throw new BookingError('no_login', 'เปิดหน้านี้ผ่าน LINE ของร้าน');
    const [c] = await sql`select pdpa_at from customers where code = ${customer}`;
    if (!c?.pdpa_at) throw new BookingError('no_consent', 'กรุณายอมรับการเก็บข้อมูลก่อนจอง');
    const b = (await req.json().catch(() => null)) as { items?: CartItem[]; accept?: boolean } | null;
    if (!b || !Array.isArray(b.items)) throw new BookingError('bad_cart', 'ข้อมูลไม่ถูกต้อง');
    return NextResponse.json(await createOrder(customer, b.items, b.accept === true, (b as { use_credit?: boolean }).use_credit === true));
  } catch (e) {
    return fail(e);
  }
}
