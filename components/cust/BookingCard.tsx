import Link from 'next/link';
import { bizLook } from '@/lib/look';
import { ORDER_ST, Pill } from '@/lib/status';
import { baht, thDate, thRangeDow } from '@/lib/thaidate';

type Item = { code: string; status: string; business_code: string; biz: string; item: string; pets: string | null; s: string; e: string };
type Order = { code: string; status: string; total: number; due_now: number; paid_amount: number | string; balance_due: number | string; items: Item[] };
type Biz = { code: string; color: string | null; booking_type: string };

// การ์ดการจอง (หน้าแรก + การจองของฉัน): แท็กธุรกิจ · ชื่อ + วัน · สิ่งที่ต้องทำต่อ · สถานะ · ›
export default function BookingCard({ o, biz }: { o: Order; biz: Biz[] }) {
  const i = o.items.find((x) => !['cancelled', 'expired'].includes(x.status)) ?? o.items[0];
  if (!i) return null;
  const b = biz.find((x) => x.code === i.business_code);
  const L = bizLook(i.business_code, b?.color ?? null, b?.booking_type ?? '');
  const d1 = i.s.slice(0, 10), d2 = i.e.slice(0, 10);
  const when = d1 !== d2 && b?.booking_type === 'stay' ? thRangeDow(d1, d2) : `${thDate(d1)} · ${i.s.slice(11, 16)}`;
  const owe = o.status === 'holding' ? `ต้องโอน ${baht(o.due_now - Number(o.paid_amount))}`
    : o.status === 'paid' && Number(o.balance_due) > 0 ? `ค้างชำระ ${baht(Number(o.balance_due))}` : null;
  return (
    <Link prefetch={false} href={`/me/b/${o.code}`} className="mybk">
      <span className="t">
        <span className="biztag" style={{ background: L.bg, color: L.fg, boxShadow: L.shadow }}>{i.biz}{o.items.length > 1 ? ` +${o.items.length - 1}` : ''}</span>
        <b>{i.item}{i.pets ? ` · ${i.pets}` : ''}</b>
        <small>{when}{owe ? ` · ${owe}` : ''}</small>
        <Pill s={ORDER_ST[o.status] ?? [o.status, '#eee', '#111']} />
      </span>
      <span className="ms go">chevron_right</span>
    </Link>
  );
}
