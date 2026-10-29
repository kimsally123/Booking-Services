'use client';
import { useState } from 'react';
import { thDate } from '@/lib/thaidate';
import { bizLook } from '@/lib/look';
import { DAYS, DayPick, Switch, useSave } from './util';

type B = { code: string; name: string; color: string | null; booking_type: string; open_hours: string | null; closed_weekdays: number[];
  checkin_time: string | null; checkout_time: string | null; deposit_type: string; deposit_value: number | null; balance_days: number | null; guide: string | null; cancel_rules: { days: number; refund: number }[]; cancel_policy: string };
type C = { id: number; business_code: string; unit_code: string | null; session_code: string | null; date_from: string; date_to: string; reason: string | null; item: string | null };

// ---------- เวลาเปิดและวันหยุด ----------
export function Hours({ biz, closures, items }: { biz: B[]; closures: C[]; items: { code: string; name: string; business_code: string; kind: 'unit' | 'session' }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [f, setF] = useState<B | null>(null);
  const [n, setN] = useState({ business_code: biz[0]?.code ?? '', item: '', date_from: '', date_to: '', reason: '', notify: false });
  const { save, busy, Msg } = useSave();
  const dayTxt = (d: number[]) => (d.length ? 'ปิด' + d.map((x) => DAYS.find(([k]) => k === x)?.[1]).join(',') : 'ทุกวัน');
  return (
    <>
      <Msg />
      <span className="cap">เวลาเปิดปกติ</span>
      <div className="list">
        {biz.map((b) => { const L = bizLook(b.code, b.color, b.booking_type); return (
          <div key={b.code} style={{ borderBottom: '1px solid var(--line)' }}>
            <button className="li" style={{ borderBottom: 0 }} onClick={() => { setOpen(open === b.code ? null : b.code); setF(b); }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: L.bg, color: L.fg, boxShadow: L.shadow, display: 'grid', placeItems: 'center' }}><span className="ms">{L.icon}</span></span>
              <span className="t"><b>{b.name}</b><small>{b.booking_type === 'stay' ? `เข้า ${b.checkin_time ?? '-'} · ออก ${b.checkout_time ?? '-'}` : b.open_hours ?? '-'} · {dayTxt(b.closed_weekdays)}</small></span>
              <span className="ms go">chevron_right</span>
            </button>
            {open === b.code && f && (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--soft)' }}>
                {b.booking_type === 'stay' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label className="cap" style={{ flex: 1 }}>เวลาเช็กอิน<input className="input" value={f.checkin_time ?? ''} onChange={(e) => setF({ ...f, checkin_time: e.target.value })} placeholder="14:00-18:00" /></label>
                    <label className="cap" style={{ flex: 1 }}>เวลาเช็กเอาต์<input className="input" value={f.checkout_time ?? ''} onChange={(e) => setF({ ...f, checkout_time: e.target.value })} placeholder="12:00" /></label>
                  </div>
                ) : <label className="cap">เวลาเปิด (แสดงให้ลูกค้าเห็น)<input className="input" value={f.open_hours ?? ''} onChange={(e) => setF({ ...f, open_hours: e.target.value })} placeholder="09:00-18:00" /></label>}
                {b.booking_type === 'slot' && <div className="cap">คิวจริงของ Grooming คิดจากเวลาทำงานของช่างแต่ละคน</div>}
                <span className="cap">ปิดประจำทุกสัปดาห์</span>
                <DayPick value={f.closed_weekdays} onChange={(v) => setF({ ...f, closed_weekdays: v })} />
                <button className="btnw dark" disabled={busy} onClick={async () => { if (await save('hours.save', { business_code: b.code, ...f })) setOpen(null); }}>บันทึก</button>
              </div>
            )}
          </div>); })}
      </div>
      <span className="cap">วันพิเศษที่จะถึง</span>
      <div className="list">
        {!closures.length && <div className="li"><span className="cap">ไม่มี</span></div>}
        {closures.map((c) => (
          <div key={c.id} className="li">
            <span className="t"><b>{c.reason || 'ปิด'}</b><small>{thDate(c.date_from)}{c.date_to !== c.date_from ? ` – ${thDate(c.date_to)}` : ''} · {biz.find((b) => b.code === c.business_code)?.name}{c.item ? ` · ${c.item}` : ' · ทั้งธุรกิจ'}</small></span>
            <span className="pill" style={{ background: '#FBE3E4', color: '#B8262E' }}>ปิด</span>
            <button className="ms go" onClick={() => save('closure.delete', { id: c.id }, 'ลบวันพิเศษแล้ว')}>close</button>
          </div>
        ))}
      </div>
      <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <b>+ เพิ่มวันปิด</b>
        <select className="input" value={n.business_code} onChange={(e) => setN({ ...n, business_code: e.target.value, item: '' })}>{biz.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</select>
        <select className="input" value={n.item} onChange={(e) => setN({ ...n, item: e.target.value })}>
          <option value="">ปิดทั้งธุรกิจ</option>
          {items.filter((x) => x.business_code === n.business_code).map((x) => <option key={x.code} value={x.kind + ':' + x.code}>เฉพาะ {x.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8 }}>
          <label className="cap" style={{ flex: 1 }}>ตั้งแต่<input className="input" type="date" value={n.date_from} onChange={(e) => setN({ ...n, date_from: e.target.value })} /></label>
          <label className="cap" style={{ flex: 1 }}>ถึง<input className="input" type="date" value={n.date_to} onChange={(e) => setN({ ...n, date_to: e.target.value })} /></label>
        </div>
        <input className="input" placeholder="เหตุผล (ลูกค้าเห็น) เช่น ซ่อมแอร์" value={n.reason} onChange={(e) => setN({ ...n, reason: e.target.value })} />
        <label className="cap" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!n.notify} onChange={(e) => setN({ ...n, notify: e.target.checked })} />แจ้งลูกค้าที่จองไว้แล้วในช่วงนี้ (ร้านเลื่อนหรือคืนเงินเต็มต่อในหน้าการจอง)</label>
        <button className="btnw dark" disabled={busy || !n.date_from} onClick={async () => {
          const [k, code] = n.item.split(':');
          if (await save('closure.add', { business_code: n.business_code, date_from: n.date_from, date_to: n.date_to || n.date_from, reason: n.reason,
            unit_code: k === 'unit' ? code : '', session_code: k === 'session' ? code : '', notify: !!n.notify }, 'เพิ่มวันปิดแล้ว · แจ้งลูกค้าที่จองไว้แล้ว (ถ้ามี)')) setN({ ...n, date_from: '', date_to: '', reason: '', item: '', notify: false });
        }}>เพิ่ม</button>
      </div>
    </>
  );
}

// ---------- มัดจำและยกเลิก ----------
export function Deposit({ biz, hold, isOwner }: { biz: B[]; hold: number; isOwner: boolean }) {
  const [k, setK] = useState(0);
  const [f, setF] = useState(biz.map((b) => ({ ...b, cancel_rules: b.cancel_rules.length ? b.cancel_rules : [{ days: 3, refund: 100 }] })));
  const [h, setH] = useState(hold);
  const { save, busy, Msg } = useSave();
  const b = f[k];
  const upd = (p: Partial<B>) => setF(f.map((x, i) => (i === k ? { ...x, ...p } : x)));
  const rules = [...b.cancel_rules].sort((a, z) => z.days - a.days);
  const unit = b.booking_type === 'session' ? 'วัน' : 'วัน';
  const text = rules.length ? `${rules.map((r) => `ยกเลิกก่อน ${r.days} ${unit}ขึ้นไป คืน ${r.refund}%`).join(' · ')} · น้อยกว่า ${rules[rules.length - 1].days} ${unit} ไม่คืน` : 'ยกเลิกแล้วไม่คืนมัดจำ';
  return (
    <>
      <div className="seg">{f.map((x, i) => <button key={x.code} className={i === k ? 'on' : ''} onClick={() => setK(i)}>{x.name}</button>)}</div>
      <span className="cap">มัดจำ</span>
      <div className="segbox">{[['full', 'จ่ายเต็ม'], ['percent', '%'], ['fixed', 'บาท']].map(([t, l]) => <button key={t} className={b.deposit_type === t ? 'on' : ''} onClick={() => upd({ deposit_type: t })}>{l}</button>)}</div>
      {b.deposit_type !== 'full' && <label className="cap">{b.deposit_type === 'percent' ? 'มัดจำกี่ % ของราคา' : 'มัดจำกี่บาท'}<input className="input num" inputMode="decimal" value={b.deposit_value ?? ''} onChange={(e) => upd({ deposit_value: Number(e.target.value) || 0 })} /></label>}
      {b.deposit_type !== 'full' && b.booking_type === 'stay' && <label className="cap">จ่ายส่วนที่เหลือก่อนวันเข้ากี่วัน (เว้นว่าง = จ่ายที่ร้าน · จองใกล้กว่านี้จ่ายเต็ม)<input className="input num" inputMode="numeric" value={b.balance_days ?? ''} onChange={(e) => upd({ balance_days: Number(e.target.value) || null })} /></label>}
      {isOwner && <label className="cap">กันที่รอสลิป (นาที · ทุกธุรกิจ)<input className="input num" inputMode="numeric" value={h} onChange={(e) => setH(Number(e.target.value) || 0)} /></label>}
      <span className="cap">ยกเลิกก่อนวันใช้บริการ</span>
      {rules.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="input num" style={{ width: 70 }} inputMode="numeric" value={r.days} onChange={(e) => upd({ cancel_rules: rules.map((x, j) => (j === i ? { ...x, days: Number(e.target.value) || 0 } : x)) })} />
          <span className="cap" style={{ flex: 1 }}>วันขึ้นไป คืน</span>
          <input className="input num" style={{ width: 70 }} inputMode="numeric" value={r.refund} onChange={(e) => upd({ cancel_rules: rules.map((x, j) => (j === i ? { ...x, refund: Number(e.target.value) || 0 } : x)) })} />
          <span className="cap">%</span>
          <button className="ms go" onClick={() => upd({ cancel_rules: rules.filter((_, j) => j !== i) })}>close</button>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="cap">น้อยกว่า {rules[rules.length - 1]?.days ?? 0} วัน</span><b>ไม่คืน</b></div>
      <button className="btnw line" onClick={() => upd({ cancel_rules: [...rules, { days: Math.max(0, (rules[rules.length - 1]?.days ?? 7) - 1), refund: 0 }] })}>+ เพิ่มขั้น</button>
      <div className="note"><b>ลูกค้าเห็น:</b> {text}</div>
      <label className="cap">{b.booking_type === 'slot' ? 'เตรียมน้องก่อนมา' : 'กฎและสิ่งที่ต้องเตรียม'} (ปุ่มที่ 2 ของริชเมนู · ขึ้นบรรทัดใหม่ได้)
        <textarea className="input" rows={4} value={b.guide ?? ''} onChange={(e) => upd({ guide: e.target.value })} /></label>
      <div className="cap">ตอนกดยกเลิก ระบบเสนอยอดคืนตามขั้นนี้ · ร้านเลือกคืนเป็นเครดิต โอนคืน หรือไม่คืน</div>
      <Msg />
      <button className="btnw dark" disabled={busy} onClick={() => save('deposit.save', { business_code: b.code, deposit_type: b.deposit_type, deposit_value: b.deposit_value, balance_days: b.balance_days, guide: b.guide, cancel_rules: rules, cancel_policy: text, ...(isOwner ? { hold_minutes: h } : {}) })}>บันทึก</button>
    </>
  );
}

// ---------- แนะนำข้ามบริการ ----------
type X = { id: number; from_business: string; offer_business: string; title: string; when_rule: string; condition: string | null; active: boolean };
const WHEN: Record<string, string> = { checkout_day: 'วันรับกลับ/เช็กเอาต์', during_stay: 'ระหว่างพัก', same_day: 'วันเดียวกัน' };
export function Xsell({ rules, biz }: { rules: X[]; biz: B[] }) {
  const { save, Msg } = useSave();
  const L = (c: string) => { const b = biz.find((x) => x.code === c); return { ...bizLook(c, b?.color ?? null, b?.booking_type ?? ''), name: b?.name ?? c }; };
  return (
    <>
      <div className="cap">แสดงในหน้าสรุปก่อนจ่าย · ลูกค้ากดเพิ่มแล้วจ่ายรวม QR เดียว</div>
      <Msg />
      <div>
        {rules.map((r) => { const a = L(r.from_business), z = L(r.offer_business); return (
          <div key={r.id} className="row">
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: a.bg, color: a.fg, boxShadow: a.shadow, display: 'grid', placeItems: 'center' }}><span className="ms" style={{ fontSize: 18 }}>{a.icon}</span></span>
              <span className="ms" style={{ fontSize: 16, color: 'var(--ink-3)' }}>arrow_forward</span>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: z.bg, color: z.fg, boxShadow: z.shadow, display: 'grid', placeItems: 'center' }}><span className="ms" style={{ fontSize: 18 }}>{z.icon}</span></span>
            </span>
            <span className="t"><small>{a.name} → {z.name}</small><b style={{ fontSize: 15 }}>{r.title}</b><small>{WHEN[r.when_rule]}{r.condition ? ' · ' + r.condition : ''}</small></span>
            <Switch on={r.active} onChange={(v) => save('xsell.active', { id: r.id, active: v }, v ? 'เปิดแล้ว' : 'ปิดแล้ว')} />
          </div>); })}
      </div>
      <div className="note">เพิ่มหรือแก้กฎ (ธุรกิจต้นทาง · บริการที่แนะนำ · วัน) ทำในไฟล์ตั้งค่า แล้ว import ใหม่</div>
    </>
  );
}

// ---------- ข้อความ LINE · รับเงินและข้อมูลร้าน ----------
const MSG: [string, string, string][] = [
  ['msg_paid', 'ยืนยันการจอง', 'ทันทีหลังสลิปผ่าน'], ['msg_reminder', 'เตือนก่อนถึงวัน', 'ตามเวลาที่ตั้ง'], ['msg_slip_rejected', 'สลิปไม่ผ่าน', 'ทันที · พร้อมเหตุผล'],
  ['msg_groom_done', 'น้องพร้อมกลับ', 'เมื่อช่างกดเสร็จ'], ['msg_rescheduled', 'เลื่อนวัน', 'เมื่อร้านเลื่อนวันให้'], ['msg_cancelled', 'ยกเลิกการจอง', 'เมื่อร้านกดยกเลิก'], ['msg_vaccine', 'ผลตรวจวัคซีน', 'เมื่อร้านตรวจเสร็จ'],
];
export function Messages({ values }: { values: Record<string, string> }) {
  const [v, setV] = useState(values);
  const [hrs, setHrs] = useState(values.remind_hours_before ?? '24');
  const { save, Msg } = useSave();
  const set = (k: string, on: boolean) => { const n = { ...v, [k]: on ? 'on' : 'off' }; setV(n); save('settings.save', { values: { [k]: n[k] } }, on ? 'เปิดข้อความแล้ว' : 'ปิดข้อความแล้ว'); };
  return (
    <>
      <Msg />
      {MSG.map(([k, t, s]) => (
        <div key={k} className="row"><span className="t"><b>{t}</b><small>{s}</small></span><Switch on={v[k] !== 'off'} onChange={(on) => set(k, on)} /></div>
      ))}
      <label className="cap">เตือนก่อนถึงวันกี่ชั่วโมง<input className="input num" inputMode="numeric" value={hrs} onChange={(e) => setHrs(e.target.value)} onBlur={() => save('settings.save', { values: { remind_hours_before: hrs } })} /></label>
      <div className="note">ข้อความใช้โควตาข้อความของ LINE OA ร่วมกันทั้ง 4 ธุรกิจ · ปิดข้อความที่ไม่จำเป็นได้ · แชทพูดคุยปกติไม่นับโควตา</div>
    </>
  );
}

const PAY: [string, string, string][] = [
  ['shop_name', 'ชื่อร้าน (แสดงในหน้าจองและข้อความ)', 'เพื่อนหมา PET LOVER'], ['legal_name', 'ชื่อในใบเสร็จ', 'บริษัท …'],
  ['promptpay_id', 'เลขพร้อมเพย์รับมัดจำ', 'เบอร์ 10 หลัก หรือเลข 13 หลัก'], ['account_name', 'ชื่อบัญชี (แสดงใต้ QR)', 'บจก. …'],
  ['liff_id', 'LIFF ID (จาก LINE Developers)', '2001234567-AbCdEfGh'],
  ['notify_email', 'อีเมลรับแจ้งจองใหม่ / สลิป (คั่น , ได้)', 'shop@example.com'], ['line_oa_id', 'LINE OA ID (ปุ่มแชทกับร้าน)', '@xxxx'], ['shop_phone', 'เบอร์ร้าน', '0xx-xxx-xxxx'],
  ['shop_address', 'ที่อยู่ร้าน (หน้าติดต่อเจ้าหน้าที่)', 'เลขที่ ถนน ตำบล อำเภอ'], ['shop_map_url', 'ลิงก์ Google Maps', 'https://maps.app.goo.gl/…'],
];
export function PaySettings({ values }: { values: Record<string, string> }) {
  const [v, setV] = useState(values);
  const { save, busy, Msg } = useSave();
  return (
    <>
      {PAY.map(([k, l, ph]) => <label key={k} className="cap">{l}<input className="input" value={v[k] ?? ''} placeholder={ph} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>)}
      <div className="note">QR พร้อมเพย์สร้างตามยอดมัดจำของแต่ละการจอง · ตรวจชื่อบัญชีให้ตรงกับที่ลูกค้าเห็นในแอปธนาคาร</div>
      <Msg />
      <button className="btnw dark" disabled={busy} onClick={() => save('settings.save', { values: Object.fromEntries(PAY.map(([k]) => [k, v[k] ?? ''])) })}>บันทึก</button>
    </>
  );
}
