'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BizCatalog, CartItem, Pet, Quote, Unit } from '@/lib/types';
import { addDays, baht, daysBetween, isoDow, thDate, thDay } from '@/lib/thaidate';
import { BottomBar, Photo, Progress, Stepper, Tick, TopBar } from './ui';
import Calendar, { type Cell, type Mark } from './Calendar';
import TripAddons, { type Addon } from './TripAddons';
import UnitDetail from './UnitDetail';
import { BOOK_AHEAD_MONTHS, lastBookable, maxNights } from '@/lib/rules';
import { clearTrip, loadTrip, saveTrip, type TripEntry } from '@/lib/trip';
import { bizLook } from '@/lib/look';

type StepKey = 'dates' | 'day' | 'guests' | 'pets' | 'pet' | 'unit' | 'session' | 'service' | 'addons' | 'slot' | 'summary';
type Avail<T> = { loading: boolean; error: string | null; data: T | null };
type UnitAv = { code: string; free: boolean; reason: string | null };
type SessAv = { code: string; start: string; end: string; size_rule: string; left: number; capacity: number; free: boolean; reason: string | null };
type SlotAv = { minutes: number; closed: boolean; slots: { start: string; staff: string; staff_name: string }[];
                grid: { start: string; staff: string | null; staff_name: string | null; free: { staff: string; staff_name: string }[]; pet_busy?: boolean }[] };
type MonthAv = {
  today: string; last: string; until: string;
  days: Record<string, { closed: boolean; reason: string | null }>;
  units?: { code: string; price: number; weekend_price: number | null; busy: string[]; off: string[] }[];
  sessions?: Record<string, { open: number; later: number; free: number }>;
  slots?: Record<string, { free: number; reason: string | null }>;
};
// 4500 → 4.5k · 12000 → 12k · 800 → ฿800
const kBaht = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : baht(n));
const weekendNight = (d: string) => { const w = isoDow(d); return w === 5 || w === 6; };

const SIZE_TH: Record<string, string> = { small: 'น้องเล็ก ≤ 10 กก.', large: 'น้องใหญ่ 10 กก.+', all: 'ทุกขนาด' };

// ดึงข้อมูลจาก API ตาม key (เปลี่ยน key = โหลดใหม่)
function useFetch<T>(url: string | null, body?: unknown): Avail<T> {
  const [st, setSt] = useState<Avail<T>>({ loading: false, error: null, data: null });
  const key = url ? url + JSON.stringify(body ?? null) : null;
  useEffect(() => {
    if (!url) { setSt({ loading: false, error: null, data: null }); return; }
    let live = true;
    setSt({ loading: true, error: null, data: null });
    fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.message || 'โหลดไม่สำเร็จ'); return j as T; })
      .then((d) => live && setSt({ loading: false, error: null, data: d }))
      .catch((e: Error) => live && setSt({ loading: false, error: e.message, data: null }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return st;
}

export default function BookingFlow({ cat, pets, loggedIn, today, initial, credit = 0 }:
  { cat: BizCatalog; pets: Pet[]; loggedIn: boolean; today: string; initial?: { date?: string; service?: string; unit?: string }; credit?: number }) {
  const router = useRouter();
  const b = cat.business;
  const forPeople = cat.units.some((u) => u.max_people);              // Villa = ที่พักคน
  const petsAllowed = cat.units.some((u) => (u.max_pets ?? 0) > 0);
  const mains = cat.services.filter((s) => s.kind === 'main');
  const addonList = cat.services.filter((s) => s.kind === 'addon');

  const steps: StepKey[] = b.booking_type === 'stay'
    ? (forPeople ? ['dates', 'guests', 'unit', 'summary'] : ['dates', 'pets', 'unit', 'summary'])
    : b.booking_type === 'session' ? ['day', 'pets', 'session', 'summary']
    : ['pet', 'service', 'addons', 'slot', 'summary'];

  const [i, setI] = useState(0);
  const step = steps[i];
  const lastDay = lastBookable(today);
  const start = initial?.date && /^\d{4}-\d{2}-\d{2}$/.test(initial.date) && initial.date >= today && initial.date <= lastDay ? initial.date : null;
  const [from, setFrom] = useState<string | null>(b.booking_type === 'stay' ? start : null);
  const [to, setTo] = useState<string | null>(null);
  const nights = from && to ? daysBetween(from, to) : 0;
  const maxN = maxNights(forPeople);
  const word = forPeople ? 'หลัง' : 'ห้อง';
  const inWord = forPeople ? 'เข้าพัก' : 'เช็กอิน', outWord = forPeople ? 'เช็กเอาต์' : 'รับกลับ';
  const [guests, setGuests] = useState(2);
  // น้องที่เลือก · Grooming เลือกตัวแรกไว้ให้ (1 คิวต่อ 1 ตัว)
  const [sel, setSel] = useState<string[]>(b.booking_type === 'slot' && pets[0] ? [pets[0].code] : []);
  const [unit, setUnit] = useState<string | null>(initial?.unit && cat.units.some((u) => u.code === initial.unit) ? initial.unit : null);
  const [detail, setDetail] = useState<Unit | null>(null);   // เปิดดูรายละเอียดห้อง/บ้าน
  const [date, setDate] = useState<string | null>(b.booking_type === 'stay' ? null : start);
  const [session, setSession] = useState<string | null>(null);
  const [service, setService] = useState<string | null>(initial?.service && mains.some((m) => m.code === initial.service) ? initial.service : null);
  const [addons, setAddons] = useState<string[]>([]);
  const [slot, setSlot] = useState<{ start: string; staff: string; staff_name: string } | null>(null);
  const [time, setTime] = useState<string | null>(null);         // Grooming: เลือกเวลาก่อน แล้วเลือกช่าง
  const [toast, setToast] = useState('');
  const toastT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = (m: string) => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2400); };
  const [accept, setAccept] = useState(false);
  const [useCredit, setUseCredit] = useState(credit > 0);
  const [busy, setBusy] = useState(false);
  const [orderErr, setOrderErr] = useState('');
  const [trip, setTrip] = useState<TripEntry[]>([]);
  useEffect(() => setTrip(loadTrip()), []);

  const chosenPets = pets.filter((p) => sel.includes(p.code));
  const pet = chosenPets[0] ?? null;
  const vaxPass = (p: Pet, on: string) => !b.need_vaccine || (!!p.vaccine_until && p.vaccine_until >= on);
  // ร้านตั้ง "ตรวจวัคซีนวันมา" = เลือกน้องได้ทุกตัว แต่บอกให้นำสมุดวัคซีนมา
  const vaxOk = (p: Pet, on: string) => cat.vaccine_check !== 'booking' || vaxPass(p, on);
  const serviceDate = (b.booking_type === 'stay' ? from : date) ?? today;

  // ---------- ที่ว่างจาก server ----------
  const maxKg = chosenPets.length ? Math.max(...chosenPets.map((p) => Number(p.weight_kg))) : 0;
  const month = useFetch<MonthAv>(b.booking_type !== 'slot' ? `/api/availability?type=month&biz=${b.code}`
    : step === 'slot' && service ? `/api/availability?type=month&biz=${b.code}&service=${service}&addons=${addons.join(',')}&tier=${pet?.tier_code ?? ''}` : null);
  const M = month.data;
  const unitAv = useFetch<{ units: UnitAv[] }>(step === 'unit' && from && to
    ? `/api/availability?type=stay&biz=${b.code}&from=${from}&to=${to}&pets=${sel.length}${forPeople ? `&guests=${guests}` : ''}${maxKg ? `&maxkg=${maxKg}` : ''}`
    : null);
  const sessAv = useFetch<{ sessions: SessAv[] }>(step === 'session' && date
    ? `/api/availability?type=session&biz=${b.code}&date=${date}&kg=${chosenPets.map((p) => p.weight_kg).join(',')}` : null);
  const slotAv = useFetch<SlotAv>(step === 'slot' && service && date
    ? `/api/availability?type=slot&biz=${b.code}&date=${date}&service=${service}&addons=${addons.join(',')}&tier=${pet?.tier_code ?? ''}${pet ? `&pets=${pet.code}` : ''}` : null);

  // ---------- ปฏิทิน ----------
  const unitSets = useMemo(() => (M?.units ?? []).map((u) => ({ ...u, B: new Set([...u.busy, ...u.off]) })), [M]);
  const nightPrice = (u: { price: number; weekend_price: number | null }, d: string) =>
    weekendNight(d) && u.weekend_price !== null ? Number(u.weekend_price) : Number(u.price);
  const freeRange = (a: string, z: string) => unitSets.filter((u) => {
    for (let d = a; d < z; d = addDays(d, 1)) if (u.B.has(d)) return false;
    return true;
  });
  const busyNights = (code: string, a: string, z: string) => {
    const u = unitSets.find((x) => x.code === code); const out: string[] = [];
    if (u) for (let d = a; d < z; d = addDays(d, 1)) if (u.B.has(d)) out.push(d);
    return out;
  };
  const base = (d: string): Cell | null => {
    if (!M) return { kind: 'off', pick: false, reason: month.error || 'กำลังโหลดปฏิทิน…' };
    if (d < M.today) return { kind: 'off', pick: false, reason: 'วันที่ผ่านไปแล้ว' };
    if (M.days[d]?.closed) return { kind: 'off', pick: false, reason: M.days[d].reason ?? 'ร้านปิด' };
    if (d > M.last) return { kind: 'off', pick: false, reason: `จองล่วงหน้าได้ไม่เกิน ${BOOK_AHEAD_MONTHS} เดือน` };
    return null;
  };
  const nightCell = (d: string): Cell => {
    const f = unitSets.filter((u) => !u.B.has(d));
    if (!f.length) return { kind: 'full', sub: 'เต็ม', pick: false, reason: `${word}เต็มคืนนี้` };
    return { kind: 'free', sub: forPeople ? kBaht(Math.min(...f.map((u) => nightPrice(u, d)))) : `ว่าง ${f.length}`, pick: true };
  };
  const stayCell = (d: string): Cell => {
    if (from && !to && d > from) {                       // กำลังเลือกวันออก
      if (!M) return base(d)!;
      if (M.days[d]?.closed) return { kind: 'off', pick: false, reason: `${M.days[d].reason} · ${outWord}วันนี้ไม่ได้` };
      const c = d <= M.until && unitSets.some((u) => !u.B.has(d)) ? nightCell(d) : { kind: 'full' as const, sub: 'เต็ม', pick: true };
      if (daysBetween(from, d) > maxN) return { ...c, pick: false, reason: `พักได้สูงสุด ${maxN} คืน` };
      if (!freeRange(from, d).length) return { ...c, pick: false, reason: `ไม่มี${word}ว่างตลอดช่วงนี้ · ลองลดจำนวนคืน` };
      return { ...c, pick: true };                       // วันออกเป็นวันที่เต็มได้ (ไม่ได้ค้างคืนนั้น)
    }
    return base(d) ?? nightCell(d);
  };
  const stayMark = (d: string): Mark => (d === from ? (to ? 'start' : 'one') : d === to ? 'end' : from && to && d > from && d < to ? 'in' : null);
  const pickStay = (d: string) => {
    if (from && !to && d > from) setTo(d); else { setFrom(d); setTo(null); }
    setUnit(null);
  };
  const dayCell = (d: string): Cell => {
    const x = base(d); if (x) return x;
    if (b.booking_type === 'session') {
      const s = M?.sessions?.[d];
      if (!s || !s.open) return { kind: 'off', pick: false, reason: 'ไม่มีรอบวันนี้' };
      if (!s.later) return { kind: 'off', pick: false, reason: 'วันนี้หมดรอบแล้ว' };
      if (!s.free) return { kind: 'full', sub: 'เต็ม', pick: false, reason: 'รอบเต็มทุกรอบแล้ววันนี้' };
      return { kind: 'free', sub: `${s.free} รอบ`, pick: true };
    }
    const s = M?.slots?.[d];
    if (!s) return { kind: 'off', pick: false, reason: 'ร้านปิด' };
    if (!s.free) return { kind: /เลยเวลา/.test(s.reason ?? '') ? 'off' : 'full', sub: 'เต็ม', pick: false, reason: s.reason ?? 'คิวเต็ม' };
    return { kind: 'free', sub: `${s.free} เวลา`, pick: true };
  };
  const stayTotal = (u: { price: number; weekend_price: number | null; pet_fee?: number | null }) => {
    if (!from || !to) return 0;
    let t = 0;
    for (let d = from; d < to; d = addDays(d, 1)) t += nightPrice(u, d);
    return t + (u.pet_fee ? Number(u.pet_fee) * sel.length * nights : 0);
  };
  const isFreeUnit = (code: string) => !!from && !!to && freeRange(from, to).some((u) => u.code === code) && !!unitAv.data?.units.find((x) => x.code === code)?.free;
  const totalOf = (u: Unit) => stayTotal({ price: Number(u.price), weekend_price: u.weekend_price === null ? null : Number(u.weekend_price), pet_fee: u.pet_fee });
  const calendar = (cell: (d: string) => Cell, mark: (d: string) => Mark, onPick: (d: string) => void, focus: string | null) => (
    <>
      {month.error && <div className="err">{month.error}</div>}
      <Calendar today={today} until={M?.until ?? addDays(today, 60)} focus={focus} cell={cell} mark={mark} onPick={onPick} onBlocked={flash} />
    </>
  );

  const cart: CartItem | null = useMemo(() => {
    if (b.booking_type === 'stay' && unit && from && to) return { business: b.code, kind: 'stay', unit, from, to, pets: sel, guests: forPeople ? guests : undefined };
    if (b.booking_type === 'session' && session && date) return { business: b.code, kind: 'session', session, date, pets: sel };
    if (b.booking_type === 'slot' && service && slot && pet && date) return { business: b.code, kind: 'slot', service, addons, staff: slot.staff, start: `${date}T${slot.start}`, pet: pet.code };
    return null;
  }, [b, unit, from, to, sel, guests, forPeople, session, date, service, slot, pet, addons]);
  const [extras, setExtras] = useState<Addon[]>([]);          // รายการที่เพิ่มในการ์ด "เพิ่มให้ทริปนี้"
  // เปลี่ยนวันหรือน้องของการจองหลัก = ล้างรายการที่เพิ่ม (วันในทริปเปลี่ยน)
  useEffect(() => setExtras([]), [from, to, date, sel.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const allItems = cart ? [...trip.map((t) => t.item), cart, ...extras.flatMap((x) => x.items)] : [];
  const q = useFetch<Quote>(step === 'summary' && cart ? '/api/quote' : null, cart ? { items: allItems } : undefined);

  // ---------- ราคาประมาณ (ระหว่างเลือก) ----------
  const estimate = (() => {
    if (b.booking_type === 'stay') {
      if (!from || !to) return null;                     // ยังเลือกวันไม่ครบ = "—"
      const u = cat.units.find((x) => x.code === unit);
      if (u) return stayTotal({ price: Number(u.price), weekend_price: u.weekend_price === null ? null : Number(u.weekend_price), pet_fee: u.pet_fee });
      const free = freeRange(from, to).map((x) => stayTotal(x));
      return free.length ? Math.min(...free) : null;
    }
    if (b.booking_type === 'session') {
      const s = cat.sessions.find((x) => x.code === session) ?? cat.sessions[0];
      if (!date) return null;
      return s ? Number(s.price) * Math.max(1, sel.length) : 0;
    }
    const s = mains.find((x) => x.code === service);
    const main = !s ? 0 : s.price_mode === 'flat' ? Number(s.price) : Number(s.prices.find((p) => p.tier_code === pet?.tier_code)?.price ?? s.prices[0]?.price ?? 0);
    return main + addonList.filter((a) => addons.includes(a.code)).reduce((t, a) => t + Number(a.price), 0);
  })();

  const note = (() => {
    if (b.booking_type === 'stay') {
      if (!from) return `เลือกวัน${inWord}`;
      if (!to) return `เลือกวัน${outWord}`;
      return `${thDate(from)} – ${thDate(to)} · ${nights} คืน${sel.length ? ` · น้อง ${sel.length}` : ''}`;
    }
    if (b.booking_type === 'session') return date ? `${thDate(date)}${sel.length ? ` · ${sel.length} ตัว` : ''}` : 'เลือกวัน';
    if (step === 'slot' || date) return date ? `${thDate(date)}${slot ? ` · ${slot.start} · พี่${slot.staff_name}` : time ? ` · ${time} · เลือกช่าง` : ' · เลือกเวลา'}` : 'เลือกวันและเวลา';
    return pet ? pet.name : 'เลือกน้อง';
  })();

  const valid: Record<StepKey, boolean> = {
    dates: nights >= 1 && nights <= maxN,
    day: !!date,
    guests: guests >= 1,
    pets: b.booking_type === 'stay' ? sel.length > 0 : sel.length > 0,
    pet: sel.length === 1,
    unit: !!unit && !!unitAv.data?.units.find((u) => u.code === unit)?.free,
    session: !!session,
    service: !!service,
    addons: true,
    slot: !!date && !!slot,
    summary: !!q.data && accept,
  };

  const go = (d: number) => {
    const n = i + d;
    if (n < 0) return router.push('/');
    setI(Math.min(n, steps.length - 1));
    window.scrollTo(0, 0);
  };
  // ขายข้ามธุรกิจ: เก็บรายการนี้ไว้ในทริป แล้วไปเลือกบริการถัดไป (จ่ายรวม QR เดียว)
  const offerDate = (rule: string) => (b.booking_type !== 'stay' ? date
    : rule === 'checkout_day' ? to : from && nights > 1 ? addDays(from, 1) : from) ?? today;
  const addOffer = (x: BizCatalog['cross_sells'][number]) => {
    if (!cart || !q.data) return;
    const qi = q.data.items[q.data.items.length - 1];
    saveTrip([...trip, { item: cart, title: qi.title, when: qi.when, business_name: b.name }]);
    const svc = x.offer_item ? `&service=${encodeURIComponent(x.offer_item)}` : '';
    router.push(`/b/${x.offer_business}?trip=1&date=${offerDate(x.when_rule)}${svc}`);
  };
  const removeTrip = (k: number) => { const t = trip.filter((_, j) => j !== k); setTrip(t); saveTrip(t); };
  const offers = cat.cross_sells;

  // สร้างการจองจริง → ไปหน้าจ่าย
  const placeOrder = async () => {
    if (!cart) return;
    setBusy(true); setOrderErr('');
    const r = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: allItems, accept, use_credit: useCredit && credit > 0 }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setOrderErr(j.message || 'จองไม่สำเร็จ'); return; }
    clearTrip();
    router.push(j.paid ? `/me?done=${j.order}` : `/pay/${j.order}`);
  };
  const toggle = (code: string, single = false) => {
    setSel((s) => (single ? [code] : s.includes(code) ? s.filter((x) => x !== code) : [...s, code]));
    setUnit(null); setSession(null); setSlot(null);
  };

  // ---------- เนื้อหาแต่ละขั้น ----------
  const petCards = (single: boolean) => (
    <>
      {!loggedIn && <div className="warn"><span className="ms">info</span>เปิดหน้านี้ผ่าน LINE ของร้านเพื่อเลือกน้องและจอง</div>}
      {loggedIn && !pets.length && <div className="warn"><span className="ms">info</span>ยังไม่มีข้อมูลน้องในบัญชีนี้</div>}
      {loggedIn && (
        <a className="btn ghost" style={{ alignSelf: 'flex-start', height: 40 }} href={`/me/pets?back=/b/${b.code}`}>
          <span className="ms">{b.need_vaccine ? 'vaccines' : 'add'}</span>{b.need_vaccine ? 'เพิ่มน้อง / ส่งรูปวัคซีน' : 'เพิ่มน้อง'}
        </a>
      )}
      {pets.map((p) => {
        const ok = vaxOk(p, serviceDate);
        return (
          <button key={p.code} className={'card' + (sel.includes(p.code) ? ' on' : '')} disabled={!ok} onClick={() => toggle(p.code, single)}>
            <Photo file={p.photo} h={44} label="" />
            <span className="t">
              <b>{p.name}</b>
              <small>{[p.breed, `${p.weight_kg} กก.`].filter(Boolean).join(' · ')}</small>
              {b.need_vaccine && (vaxPass(p, serviceDate)
                ? <small className="ok">วัคซีนผ่านตรวจ ใช้ได้ถึง {thDay(p.vaccine_until!)}</small>
                : ok ? <small style={{ color: 'var(--amber)' }}>{p.vaccine_pending ? 'วัคซีนรอร้านตรวจ' : 'ยังไม่มีวัคซีนในระบบ'} · นำสมุดวัคซีนมาวันใช้บริการ</small>
                : <small style={{ color: 'var(--red-ink)' }}>{p.vaccine_pending ? 'วัคซีนรอร้านตรวจ' : 'ยังไม่มีวัคซีนที่ผ่านตรวจ'}</small>)}
            </span>
            <Tick on={sel.includes(p.code)} />
          </button>
        );
      })}
    </>
  );

  let content: React.ReactNode = null;
  if (step === 'dates') content = (
    <>
      <div className="h1">{forPeople ? 'เข้าพักวันไหน' : 'พักวันไหน'}</div>
      <div className="sub">แตะวัน{inWord} แล้วแตะวัน{outWord} · เช็กอิน {b.checkin_time || '14:00'} · เช็กเอาต์ {b.checkout_time || '12:00'}</div>
      <div className="rangebox">
        <div className={!from || to ? 'on' : ''}><small>{inWord}</small><b>{from ? thDate(from) : '—'}</b></div>
        <div className={from && !to ? 'on' : ''}><small>{outWord}</small><b>{to ? thDate(to) : '—'}</b></div>
        <div><small>จำนวน</small><b className="num">{nights ? `${nights} คืน` : '—'}</b></div>
      </div>
      {calendar(stayCell, stayMark, pickStay, from)}
      <div className="sub" style={{ fontSize: 13 }}>{forPeople ? 'ใต้วันที่คือราคาเริ่มต้นต่อคืน' : 'ใต้วันที่คือจำนวนห้องที่ว่างคืนนั้น'} · พักได้สูงสุด {maxN} คืน</div>
    </>
  );
  if (step === 'day') content = (
    <>
      <div className="h1">วันไหน</div>
      <div className="sub">ใต้วันที่คือจำนวนรอบที่ยังมีที่ว่าง</div>
      {calendar(dayCell, (d) => (d === date ? 'one' : null), (d) => { setDate(d); setSession(null); }, date)}
    </>
  );
  if (step === 'guests') content = (
    <>
      <div className="h1">ผู้เข้าพัก</div>
      <div className="card" style={{ justifyContent: 'space-between' }}>
        <span className="t"><b>จำนวนคน</b><small>รวมเด็ก</small></span>
        <Stepper value={guests} min={1} max={Math.max(...cat.units.map((u) => u.max_people ?? 1))} onChange={(n) => { setGuests(n); setUnit(null); }} />
      </div>
      {petsAllowed && <><div className="section">พาน้องมาด้วยไหม</div><div className="sub">เลือกได้ไม่บังคับ · คิดค่าน้องต่อตัวต่อคืน</div>{petCards(false)}</>}
    </>
  );
  if (step === 'pets') content = (
    <><div className="h1">น้องที่มา{b.booking_type === 'stay' ? 'พัก' : 'ว่ายน้ำ'}</div>
      {b.need_vaccine && <div className="sub">{cat.vaccine_check === 'booking' ? 'ต้องมีวัคซีนที่ร้านตรวจแล้ว และยังไม่หมดอายุ' : 'นำสมุดวัคซีนมาวันใช้บริการ ร้านตรวจหน้างาน'}</div>}
      {petCards(false)}</>
  );
  if (step === 'pet') content = <><div className="h1">น้องตัวไหน</div>{petCards(true)}</>;
  if (step === 'unit' && from && to) {
    const freeCodes = new Set(freeRange(from, to).map((u) => u.code));
    const isFree = (code: string) => freeCodes.has(code) && !!unitAv.data?.units.find((x) => x.code === code)?.free;
    const list = [...cat.units].sort((x, y) => Number(isFree(y.code)) - Number(isFree(x.code)))
      .filter((u) => !forPeople || isFree(u.code));
    const nFree = cat.units.filter((u) => isFree(u.code)).length;
    content = (
      <>
        <div className="h1">{forPeople ? 'หลังที่ว่าง' : 'ห้องที่ว่าง'}</div>
        <div className="sub">{thDate(from)} – {thDate(to)} · {nights} คืน{unitAv.data ? ` · ว่าง ${nFree} จาก ${cat.units.length} ${word}` : ''}</div>
        {unitAv.loading && <><div className="skeleton" style={{ height: 220 }} /><div className="skeleton" style={{ height: 220 }} /></>}
        {unitAv.error && <div className="err">{unitAv.error}</div>}
        {unitAv.data && !nFree && <div className="warn"><span className="ms">info</span>ไม่มี{word}ว่างตลอดช่วงนี้ · ลองเปลี่ยนวัน</div>}
        {unitAv.data && list.map((u) => {
          const av = unitAv.data!.units.find((x) => x.code === u.code);
          const ok = isFree(u.code);
          const busy = busyNights(u.code, from, to);
          const why = ok ? null : busy.length ? `ไม่ว่างคืน ${busy.slice(0, 3).map((d) => thDate(d)).join(', ')}${busy.length > 3 ? ` และอีก ${busy.length - 3} คืน` : ''}` : av?.reason;
          const total = stayTotal({ price: Number(u.price), weekend_price: u.weekend_price === null ? null : Number(u.weekend_price), pet_fee: u.pet_fee });
          return (
            <button key={u.code} className={'unit' + (unit === u.code ? ' on' : '')} disabled={!ok} onClick={() => setUnit(u.code)}>
              <Photo file={u.photos[0]?.file} />
              <div className="row">
                <span className="t">
                  <b>{u.name}</b>
                  <small>{u.summary}</small>
                  {why && <small style={{ color: 'var(--red-ink)' }}>{why}</small>}
                  {u.pet_fee && sel.length > 0 ? <small>รวมค่าน้อง {baht(Number(u.pet_fee))}/ตัว/คืน</small> : null}
                  <span className="more" role="link" onClick={(e) => { e.stopPropagation(); setDetail(u); }}>ดูรายละเอียดและรูป</span>
                </span>
                <span className="p num">{baht(total)}<small>รวม {nights} คืน</small></span>
              </div>
            </button>
          );
        })}
      </>
    );
  }
  if (step === 'session' && date) {
    const open = cat.sessions.filter((x) => x.weekdays.includes(isoDow(date)));
    content = (
      <>
        <div className="h1">เลือกรอบ · {thDate(date)}</div>
        <div className="sub">ที่ว่างของวันนี้ · เปลี่ยนวันได้ที่ปุ่มย้อนกลับ</div>
        {sessAv.loading && <div className="skeleton" />}
        {sessAv.error && <div className="err">{sessAv.error}</div>}
        {sessAv.data && !open.length && <div className="warn"><span className="ms">info</span>วันนี้ไม่มีรอบ</div>}
        {sessAv.data?.sessions.map((x) => (
          <button key={x.code} className={'card' + (session === x.code ? ' on' : '')} disabled={!x.free} onClick={() => setSession(x.code)}>
            <span className="t"><span className={'sizetag ' + x.size_rule}>{SIZE_TH[x.size_rule]}</span><b className="num">{x.start}–{x.end}</b></span>
            <span className="p num" style={{ fontSize: 14 }}>{x.free ? `เหลือ ${x.left} ที่` : x.reason}</span>
          </button>
        ))}
      </>
    );
  }
  if (step === 'service') content = (
    <>
      <div className="h1">บริการหลัก</div>
      <div className="sub">ราคาตามขนาดของ{pet?.name ?? 'น้อง'}</div>
      {mains.map((s) => {
        const p = s.price_mode === 'flat' ? s : s.prices.find((x) => x.tier_code === pet?.tier_code);
        const tier = cat.tiers.find((t) => t.code === pet?.tier_code);
        return (
          <button key={s.code} className={'card' + (service === s.code ? ' on' : '')} disabled={!p} onClick={() => { setService(s.code); setSlot(null); setTime(null); }}>
            {s.photos?.[0] && <Photo file={s.photos[0].file} h={56} />}
            <span className="t"><b>{s.name}</b><small>{[s.description, p?.duration_min ? `${p.duration_min} นาที` : ''].filter(Boolean).join(' · ')}</small></span>
            <span className="p num">{p ? baht(Number(p.price)) : '-'}<small>{s.price_mode === 'by_weight' ? tier?.label : ''}</small></span>
          </button>
        );
      })}
    </>
  );
  if (step === 'addons') content = (
    <>
      <div className="h1">เพิ่มบริการเสริม</div>
      <div className="sub">ไม่เลือกก็ได้ · ค่าสภาพขนช่างจะแจ้งก่อนเริ่มทำ</div>
      {addonList.map((a) => (
        <button key={a.code} className={'card' + (addons.includes(a.code) ? ' on' : '')} onClick={() => { setAddons((x) => x.includes(a.code) ? x.filter((y) => y !== a.code) : [...x, a.code]); setSlot(null); setTime(null); }}>
          <span className="t"><b>{a.name}</b></span>
          <span className="p num">{baht(Number(a.price))}</span>
          <Tick on={addons.includes(a.code)} />
        </button>
      ))}
    </>
  );
  if (step === 'slot') content = (
    <>
      <div className="h1">วันและเวลา</div>
      <div className="sub">เลือกวันจากปฏิทิน แล้วเลือกเวลาด้านล่าง</div>
      {calendar(dayCell, (d) => (d === date ? 'one' : null), (d) => { setDate(d); setSlot(null); setTime(null); }, date)}
      {date && (
        <>
          <div className="section">เวลา · {thDate(date)}</div>
          {slotAv.loading && <div className="skeleton" />}
          {slotAv.error && <div className="err">{slotAv.error}</div>}
          {slotAv.data && <div className="sub">ใช้เวลาประมาณ {slotAv.data.minutes} นาที</div>}
          {slotAv.data && (slotAv.data.closed || !slotAv.data.slots.length) && <div className="warn"><span className="ms">info</span>{slotAv.data.closed ? 'ร้านปิดวันนี้' : 'วันนี้คิวเต็ม ลองวันอื่น'}</div>}
          <div className="times">
            {slotAv.data?.grid.map((x) => {
              const n = x.free.length;
              return (
                <button key={x.start} className={'chip' + (time === x.start ? ' on' : '') + (n ? '' : ' full')} disabled={!n}
                  onClick={() => { setTime(x.start); setSlot(n === 1 ? { start: x.start, ...x.free[0] } : null); }}>
                  <b className="num">{x.start}</b><small>{n ? `ว่าง ${n} ช่าง` : x.pet_busy ? 'น้องมีคิวแล้ว' : 'เต็ม'}</small>
                </button>
              );
            })}
          </div>
          {slotAv.data && !!slotAv.data.slots.length && <div className="section">ช่างที่ว่าง{time ? ` · ${time}` : ''}</div>}
          {slotAv.data && !!slotAv.data.slots.length && !time && <div className="sub" style={{ color: 'var(--red-ink)' }}>เลือกเวลาก่อน</div>}
          {time && (
            <div className="grid2">
              {(slotAv.data?.grid.find((x) => x.start === time)?.free ?? []).map((f) => (
                <button key={f.staff} className={'chip' + (slot?.staff === f.staff ? ' on' : '')} onClick={() => setSlot({ start: time, ...f })}>
                  <b>พี่{f.staff_name}</b><small>ว่าง {time}</small>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
  if (step === 'summary') content = (
    <>
      {q.loading && <><div className="skeleton" /><div className="skeleton" style={{ height: 140 }} /></>}
      {q.error && <div className="err">{q.error}</div>}
      {q.data?.items.slice(0, 1).map((it, k) => (
        <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="h1" style={{ fontSize: 20 }}>{it.title}</div>
          <div className="sub">{it.when}</div>
        </div>
      ))}
      {loggedIn && cart && (
        <TripAddons offers={offers} pets={chosenPets} value={extras} onChange={setExtras}
          main={{ kind: b.booking_type, from: from ?? date ?? today, to: to ?? date ?? today, date: date ?? from ?? today, nights, isVilla: forPeople }} />
      )}
      {q.data && (
        <div className="bill">
          {q.data.items.flatMap((it) => it.lines).map((l, k) => <div key={k} className="l"><span>{l.label}{l.note ? ` (${l.note})` : ''}</span><span className="num">{baht(l.amount)}</span></div>)}
          <hr />
          <div className="l tot"><span>รวม</span><span className="num">{baht(q.data.total)}</span></div>
          {useCredit && credit > 0 && <div className="l"><span>ใช้เครดิต</span><span className="num">−{baht(Math.min(credit, q.data.due_now))}</span></div>}
          <div className="l"><span>จ่ายตอนจอง</span><span className="num">{baht(q.data.due_now - (useCredit ? Math.min(credit, q.data.due_now) : 0))}</span></div>
          {q.data.balance > 0 && <div className="l"><span>ยอดคงเหลือ · ชำระก่อน {q.data.balance_by ? thDate(q.data.balance_by) : '-'}</span><span className="num">{baht(q.data.balance)}</span></div>}
          {q.data.pay_later > 0 && <div className="l"><span>จ่ายที่ร้าน</span><span className="num">{baht(q.data.pay_later)}</span></div>}
        </div>
      )}
      {trip.length > 0 && (
        <>
          <div className="section">รายการก่อนหน้าในทริปนี้</div>
          {trip.map((t, k) => (
            <div key={k} className="card" style={{ padding: 10 }}>
              <span className="t"><b style={{ fontSize: 14 }}>{t.business_name} · {t.title}</b><small>{t.when}</small></span>
              <button className="sub" onClick={() => removeTrip(k)}>เอาออก</button>
            </div>
          ))}
        </>
      )}
      {credit > 0 && q.data && (
        <button className={'card' + (useCredit ? ' on' : '')} onClick={() => setUseCredit(!useCredit)}>
          <span className="t"><b style={{ fontSize: 15 }}>ใช้เครดิต {baht(Math.min(credit, q.data.due_now))}</b><small>เครดิตคงเหลือ {baht(credit)}</small></span><Tick on={useCredit} />
        </button>
      )}
      <div className="section">เงื่อนไขการจองและยกเลิก</div>
      <div className="sub" style={{ fontSize: 13 }}>{b.cancel_policy}</div>
      <div className="sub" style={{ fontSize: 13 }}>หลังกดชำระเงิน ร้านกันที่ไว้ {cat.hold_minutes} นาที แนบสลิปไม่ทันระบบจะปล่อยที่ให้คนอื่น</div>
      <button className={'card' + (accept ? ' on' : '')} onClick={() => setAccept(!accept)}>
        <span className="t"><b style={{ fontSize: 15 }}>อ่านและยอมรับเงื่อนไขแล้ว</b></span><Tick on={accept} />
      </button>
      {orderErr && <div className="err">{orderErr}</div>}
    </>
  );

  const last = step === 'summary';
  if (detail) {
    const ok = step === 'unit' && isFreeUnit(detail.code);
    return <UnitDetail biz={b} unit={detail} onBack={() => setDetail(null)}
      action={step === 'unit' ? { label: ok ? `เลือก${word}นี้` : 'ไม่ว่างช่วงนี้', sub: `${nights} คืน`, price: ok ? baht(totalOf(detail)) : undefined,
        onClick: () => { if (ok) { setUnit(detail.code); setDetail(null); } } } : undefined} />;
  }
  return (
    <main className="app">
      <TopBar title={b.booking_type === 'stay' && !forPeople ? b.tagline : `จอง ${b.name}`} step={`ขั้น ${i + 1}/${steps.length}`} onBack={() => go(-1)} />
      <Progress n={steps.length} at={i} />
      <div className="body">
        {trip.length > 0 && step !== 'summary' && <div className="warn"><span className="ms">info</span>ทริปนี้มี {trip.length} รายการก่อนหน้า · จ่ายรวม QR เดียวตอนสรุป</div>}
        {content}
      </div>
      <BottomBar
        note={last ? 'จ่ายวันนี้' : note}
        amount={last ? (q.data ? baht(q.data.due_now - (useCredit ? Math.min(credit, q.data.due_now) : 0)) : '—') : estimate === null ? '—' : baht(estimate)}
        label={last ? 'ชำระเงิน' : step === 'addons' && !addons.length ? 'ข้าม' : 'ต่อไป'}
        red={last}
        disabled={!valid[step]}
        busy={busy}
        onClick={() => (last ? placeOrder() : go(1))}
      />
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
