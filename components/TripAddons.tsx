'use client';
import { useEffect, useMemo, useState } from 'react';
import type { BizCatalog, CartItem, CrossSell, Pet, Quote } from '@/lib/types';
import { addDays, baht, thDate, toMin } from '@/lib/thaidate';
import { bizLook } from '@/lib/look';

// "เพิ่มให้ทริปนี้": กด + เพิ่ม แล้วการ์ดขยายเป็นฟอร์มในที่เดิม · น้องเลือกได้เฉพาะตัวที่อยู่ในการจองหลัก
// วันให้เลือกเฉพาะวันในทริป · ราคาคิดจาก server (/api/quote) เสมอ
export type Addon = { key: string; business: string; name: string; items: CartItem[]; title: string; when: string; price: number };
type Main = { kind: 'stay' | 'session' | 'slot'; from: string; to: string; date: string; nights: number; isVilla: boolean };
type Grid = { start: string; free: { staff: string; staff_name: string }[]; pet_busy?: boolean }[];
type SlotAv = { minutes: number; closed: boolean; grid: Grid };
type SessAv = { code: string; start: string; end: string; size_rule: string; left: number; free: boolean; reason: string | null };
const SIZE_TH: Record<string, string> = { small: 'น้องเล็ก ≤ 10 กก.', large: 'น้องใหญ่ 10 กก.+', all: 'ทุกขนาด' };
type UnitAv = { code: string; free: boolean; reason: string | null };

// วันที่เลือกไว้ให้ก่อน: Grooming = วันออก/วันที่จอง · สระ = วันที่สองของทริป · Pet hotel = ทั้งทริป
const tripDays = (main: Main) => {
  if (main.kind !== 'stay') return [main.date];
  const out: string[] = [];
  for (let d = main.from; d <= main.to; d = addDays(d, 1)) out.push(d);
  return out;
};
const defaultDay = (type: string, main: Main) => type === 'slot' ? (main.kind === 'stay' ? main.to : main.date)
  : main.kind === 'stay' ? (tripDays(main)[1] ?? main.from) : main.date;
const SUB: Record<string, string> = { slot: 'เลือกน้อง บริการ เวลา และช่าง', session: 'เลือกน้อง วัน และรอบ', stay: 'เลือกน้องและห้อง' };

const j = async <T,>(url: string, body?: unknown): Promise<T> => {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const x = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(x.message || 'โหลดไม่สำเร็จ');
  return x as T;
};

export default function TripAddons({ offers, pets, main, value, onChange }:
  { offers: CrossSell[]; pets: Pet[]; main: Main; value: Addon[]; onChange: (a: Addon[]) => void }) {
  if (!pets.length || !offers.length) return null;      // การจองหลักไม่มีน้อง = ไม่ขึ้นการ์ด
  return (
    <>
      <div className="section">เพิ่มให้ทริปนี้ · จ่ายรวม QR เดียว</div>
      {offers.map((o) => {
        const key = `${o.offer_business}|${o.title}`;
        const added = value.find((a) => a.key === key) ?? null;
        return <OfferCard key={key} k={key} offer={o} pets={pets} main={main} added={added}
          onSave={(a) => onChange([...value.filter((x) => x.key !== key), a])}
          onRemove={() => onChange(value.filter((x) => x.key !== key))} />;
      })}
    </>
  );
}

function OfferCard({ k, offer, pets, main, added, onSave, onRemove }:
  { k: string; offer: CrossSell; pets: Pet[]; main: Main; added: Addon | null; onSave: (a: Addon) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const L = bizLook(offer.offer_business, offer.offer_color ?? null, offer.offer_type ?? '');
  const type = offer.offer_type;
  const whenLine = type === 'stay' ? `${thDate(main.from)} – ${thDate(main.to)} · ${main.nights} คืน` : thDate(defaultDay(type, main));
  const head = (sub: string) => (
    <span className="t">
      <span className="tag" style={{ background: L.bg, color: L.fg, alignSelf: 'flex-start' }}><span className="ms" style={{ fontSize: 15 }}>{L.icon}</span>{offer.offer_name}</span>
      <b style={{ fontSize: 15 }}>{offer.title}</b>
      <small>{sub}</small>
    </span>
  );
  if (added && !open) return (
    <div className="card" style={{ padding: 12, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>{head(whenLine)}<b className="num">{baht(added.price)}</b></div>
      <div className="sub" style={{ fontSize: 13 }}>{added.title}<br />{added.when}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn ghost" style={{ height: 36, padding: '0 14px', fontSize: 14 }} onClick={() => setOpen(true)}>แก้</button>
        <button className="btn ghost" style={{ height: 36, padding: '0 14px', fontSize: 14 }} onClick={onRemove}>เอาออก</button>
      </div>
    </div>
  );
  if (!open) return (
    <div className="card" style={{ padding: 12 }}>
      {head(whenLine)}
      <button className="btn ghost" style={{ height: 36, padding: '0 14px', fontSize: 14 }} onClick={() => setOpen(true)}>+ เพิ่ม</button>
    </div>
  );
  return (
    <div className="card on" style={{ padding: 12, flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>{head(SUB[type] ?? '')}
        <button className="btn ghost" style={{ height: 36, padding: '0 14px', fontSize: 14, flex: 'none' }} onClick={() => setOpen(false)}>ปิด</button></div>
      <AddonForm k={k} offer={offer} pets={pets} main={main} initial={added}
        onDone={(a) => { onSave(a); setOpen(false); }} onCancel={() => setOpen(false)} />
    </div>
  );
}

function AddonForm({ k, offer, pets, main, initial, onDone, onCancel }:
  { k: string; offer: CrossSell; pets: Pet[]; main: Main; initial: Addon | null; onDone: (a: Addon) => void; onCancel: () => void }) {
  const type = offer.offer_type;
  const [cat, setCat] = useState<BizCatalog | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<string[]>(() => pets.map((p) => p.code));
  // วันในทริป
  const days = useMemo(() => tripDays(main), [main]);
  const defDay = defaultDay(type, main);
  const [date, setDate] = useState(defDay);
  const [service, setService] = useState<string | null>(offer.offer_item);
  const [time, setTime] = useState<string | null>(null);
  const [staff, setStaff] = useState<{ staff: string; staff_name: string } | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [unit, setUnit] = useState<string | null>(null);
  const [month, setMonth] = useState<{ days: Record<string, { closed: boolean; reason: string | null }>; slots?: Record<string, { free: number; staff?: number; reason: string | null }>; sessions?: Record<string, { open: number; later: number; free: number }> } | null>(null);
  const [slots, setSlots] = useState<SlotAv | null>(null);
  const [sess, setSess] = useState<SessAv[] | null>(null);
  const [units, setUnits] = useState<UnitAv[] | null>(null);
  const chosen = pets.filter((p) => sel.includes(p.code));
  const first = chosen[0];

  useEffect(() => { j<BizCatalog>(`/api/catalog?biz=${offer.offer_business}`).then(setCat).catch((e) => setErr(e.message)); }, [offer.offer_business]);
  // ปฏิทินของธุรกิจที่เพิ่ม (วันปิด/เต็ม)
  useEffect(() => {
    if (type === 'stay') return;
    if (type === 'slot' && (!service || !first)) return;
    const q = type === 'slot' ? `&service=${service}&tier=${first?.tier_code ?? ''}` : '';
    j<typeof month>(`/api/availability?type=month&biz=${offer.offer_business}${q}`).then(setMonth).catch(() => setMonth(null));
  }, [type, service, first?.tier_code, offer.offer_business]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setErr('');
    if (type === 'slot' && service && first) {
      setSlots(null);
      j<SlotAv>(`/api/availability?type=slot&biz=${offer.offer_business}&date=${date}&service=${service}&addons=&tier=${first.tier_code ?? ''}&pets=${chosen.map((p) => p.code).join(',')}`)
        .then((x) => {
          setSlots(x);
          // เวลาแรกที่มีช่างว่าง
          const f = x.grid.find((g) => g.free.length);
          if (f && !time) { setTime(f.start); if (f.free.length === 1) setStaff(f.free[0]); }
        }).catch((e) => setErr(e.message));
    }
    if (type === 'session' && chosen.length) {
      setSess(null);
      j<{ sessions: SessAv[] }>(`/api/availability?type=session&biz=${offer.offer_business}&date=${date}&kg=${chosen.map((p) => p.weight_kg).join(',')}`)
        .then((x) => { setSess(x.sessions); const f = x.sessions.find((s) => s.free && s.left >= chosen.length); if (f && !session) setSession(f.code); })
        .catch((e) => setErr(e.message));
    }
    if (type === 'stay' && chosen.length) {
      setUnits(null);
      const kg = Math.max(...chosen.map((p) => Number(p.weight_kg)));
      j<{ units: UnitAv[] }>(`/api/availability?type=stay&biz=${offer.offer_business}&from=${main.from}&to=${main.to}&pets=${chosen.length}&maxkg=${kg}`)
        .then((x) => setUnits(x.units)).catch((e) => setErr(e.message));
    }
  }, [type, date, service, sel.join(','), offer.offer_business]); // eslint-disable-line react-hooks/exhaustive-deps

  const dayOff = (d: string): string | null => {
    const di = month?.days?.[d];
    if (di?.closed) return di.reason ?? 'ร้านปิด';
    if (type === 'slot') { const s = month?.slots?.[d]; if (s && !s.free) return s.reason ?? 'คิวเต็ม'; }
    if (type === 'session') { const s = month?.sessions?.[d]; if (!s || !s.open) return 'ไม่มีรอบวันนี้'; if (!s.free) return 'รอบเต็มทุกรอบ'; }
    return null;
  };
  const freeOn = (d: string) => {
    const n = type === 'slot' ? month?.slots?.[d]?.staff : type === 'session' ? month?.sessions?.[d]?.free : undefined;
    return n === undefined ? '' : `ว่าง ${n}`;
  };
  const togglePet = (c: string) => { setSel((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c])); setSession(null); setUnit(null); setTime(null); setStaff(null); };
  const mains = cat?.services.filter((s) => s.kind === 'main') ?? [];

  // กด "ใส่ในทริป": ตรวจว่าเลือกครบ → สร้างรายการ → ให้ server คิดราคา
  const save = async () => {
    const miss: string[] = [];
    if (!chosen.length) miss.push('น้อง');
    if (type === 'slot') { if (!service) miss.push('บริการ'); if (!time) miss.push('เวลา'); if (!staff) miss.push('ช่าง'); }
    if (type === 'session' && !session) miss.push('รอบ');
    if (type === 'stay' && !unit) miss.push('ห้อง');
    if (miss.length) return setErr(`ยังไม่ได้เลือก: ${miss.join(' · ')}`);
    setBusy(true); setErr('');
    try {
      let items: CartItem[] = [];
      if (type === 'slot') {
        // น้องหลายตัว: ช่างคนเดียวกัน ต่อคิวกันไปตามเวลาที่ว่างถัดไป
        let cursor = toMin(time!);
        for (const p of chosen) {
          const av = await j<SlotAv>(`/api/availability?type=slot&biz=${offer.offer_business}&date=${date}&service=${service}&addons=&tier=${p.tier_code ?? ''}&pets=${p.code}`);
          const g = av.grid.find((x) => toMin(x.start) >= cursor && x.free.some((f) => f.staff === staff!.staff));
          if (!g) throw new Error(`พี่${staff!.staff_name}ไม่ว่างต่อสำหรับ${p.name} · เลือกเวลาหรือช่างอื่น`);
          items.push({ business: offer.offer_business, kind: 'slot', service: service!, addons: [], staff: staff!.staff, start: `${date}T${g.start}`, pet: p.code });
          cursor = toMin(g.start) + av.minutes;
        }
      } else if (type === 'session') {
        items = [{ business: offer.offer_business, kind: 'session', session: session!, date, pets: sel }];
      } else {
        items = [{ business: offer.offer_business, kind: 'stay', unit: unit!, from: main.from, to: main.to, pets: sel }];
      }
      const q = await j<Quote>('/api/quote', { items });
      onDone({ key: k, business: offer.offer_business, name: offer.offer_name ?? '', items, price: q.total,
        title: q.items.map((i) => i.title).join(' · '), when: q.items.map((i) => i.when).join(' · ') });
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="cap">น้อง</div>
      <div className="chips">{pets.map((p) => <button key={p.code} className={'chip' + (sel.includes(p.code) ? ' on' : '')} onClick={() => togglePet(p.code)}><b>{p.name}</b><small>{cat?.tiers.find((t) => t.code === p.tier_code)?.label ?? `${p.weight_kg} กก.`}</small></button>)}</div>

      {type === 'slot' && <>
        <div className="cap">บริการ</div>
        <div className="chips">{mains.map((s) => {
          const pr = s.price_mode === 'flat' ? Number(s.price) : chosen.reduce((a, p) => a + Number(s.prices.find((x) => x.tier_code === p.tier_code)?.price ?? 0), 0);
          return <button key={s.code} className={'chip' + (service === s.code ? ' on' : '')} onClick={() => { if (service === s.code) return; setService(s.code); setTime(null); setStaff(null); }}><b>{s.name}</b><small>{baht(pr)}</small></button>;
        })}</div>
      </>}

      {type !== 'stay' && <>
        <div className="cap">วัน</div>
        <div className="chips">{days.map((d) => { const off = dayOff(d); return (
          <button key={d} className={'chip' + (date === d ? ' on' : '')} style={off ? { opacity: 0.4 } : undefined}
            onClick={() => (off ? setErr(off) : (setDate(d), setTime(null), setStaff(null), setSession(null)))}>
            <b>{thDate(d)}</b><small>{off ? (month?.days?.[d]?.closed ? 'ปิด' : 'เต็ม') : freeOn(d)}</small></button>); })}</div>
      </>}

      {type === 'slot' && service && <>
        <div className="cap">เวลา</div>
        {slots && !slots.grid.some((g) => g.free.length) && <div className="sub" style={{ color: 'var(--red-ink)' }}>วันนี้ไม่มีช่างว่าง · เลือกวันอื่น</div>}
        <div className="times">{slots?.grid.map((g) => (
          <button key={g.start} className={'chip' + (time === g.start ? ' on' : '') + (g.free.length ? '' : ' full')} disabled={!g.free.length}
            onClick={() => { setTime(g.start); setStaff(g.free.length === 1 ? g.free[0] : null); }}>
            <b className="num">{g.start}</b><small>{g.free.length ? `ว่าง ${g.free.length} ช่าง` : g.pet_busy ? 'น้องมีคิวแล้ว' : 'เต็ม'}</small></button>))}</div>
        <div className="cap">ช่าง{time ? ` · ว่างเวลา ${time}` : ''}</div>
        {!time && <div className="sub" style={{ color: 'var(--red-ink)' }}>เลือกเวลาก่อน</div>}
        {time && <div className="chips">{(slots?.grid.find((g) => g.start === time)?.free ?? []).map((f) => (
          <button key={f.staff} className={'chip' + (staff?.staff === f.staff ? ' on' : '')} onClick={() => setStaff(f)}><b>พี่{f.staff_name}</b></button>))}</div>}
        {chosen.length > 1 && time && <div className="sub" style={{ fontSize: 12 }}>น้อง {chosen.length} ตัวต่อคิวกันกับช่างคนเดียว เริ่ม {time}</div>}
      </>}

      {type === 'session' && <>
        <div className="cap">รอบ</div>
        {sess && !sess.length && <div className="sub" style={{ color: 'var(--red-ink)' }}>วันนี้ไม่มีรอบ</div>}
        {sess?.map((s) => { const ok = s.free && s.left >= chosen.length; return (
          <button key={s.code} className={'card' + (session === s.code ? ' on' : '')} disabled={!ok} onClick={() => setSession(s.code)} style={{ padding: 10 }}>
            <span className="t"><span className={'sizetag ' + s.size_rule}>{SIZE_TH[s.size_rule] ?? ''}</span><b className="num">{s.start}–{s.end}</b></span><span className="p num" style={{ fontSize: 13 }}>{ok ? `เหลือ ${s.left} ที่` : s.reason ?? `เหลือ ${s.left} ที่`}</span>
          </button>); })}
      </>}

      {type === 'stay' && <>
        <div className="cap">ห้อง · {thDate(main.from)} – {thDate(main.to)} · {main.nights} คืน</div>
        {units && !units.some((u) => u.free) && <div className="sub" style={{ color: 'var(--red-ink)' }}>ไม่มีห้องว่างตลอดช่วงนี้</div>}
        {units?.map((u) => { const info = cat?.units.find((x) => x.code === u.code); return (
          <button key={u.code} className={'card' + (unit === u.code ? ' on' : '')} disabled={!u.free} onClick={() => setUnit(u.code)} style={{ padding: 10 }}>
            <span className="t"><b>{info?.name ?? u.code}</b>{!u.free && <small style={{ color: 'var(--red-ink)' }}>{u.reason}</small>}</span>
            <span className="p num" style={{ fontSize: 14 }}>{info ? baht(Number(info.price) * main.nights) : ''}<small>{main.nights} คืน</small></span>
          </button>); })}
      </>}

      {err && <div className="err">{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={save}>{busy ? 'รอสักครู่…' : initial ? 'บันทึก' : 'ใส่ในทริป'}</button>
        {initial && <button className="btn ghost" onClick={onCancel}>ยกเลิก</button>}
      </div>
    </>
  );
}


