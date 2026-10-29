'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { baht } from '@/lib/thaidate';

type Sug = { paid: number; amount: number; lines: { code: string; name: string; days: number; pct: number; amount: number }[] };
const MODES: [string, string][] = [['credit', 'คืนเป็นเครดิต'], ['refund', 'โอนเงินคืน'], ['forfeit', 'ไม่คืน']];

// ยกเลิกรายการที่ยังใช้อยู่ + บันทึกการคืนเงินตามเงื่อนไขยกเลิก (เครดิตเป็นค่าเริ่ม)
export default function CancelOrder({ order, codes, canCancel = true }: { order: string; codes: string[]; canCancel?: boolean }) {
  const router = useRouter();
  const [sug, setSug] = useState<Sug | null>(null);
  const [mode, setMode] = useState('credit');
  const [amt, setAmt] = useState('');
  const [shop, setShop] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!codes.length) return null;
  if (!canCancel) return <div className="cap" style={{ textAlign: 'center' }}>ยกเลิกการจองได้เฉพาะเจ้าของหรือผู้จัดการ</div>;
  const open = async () => {
    setErr('');
    const r = await fetch(`/api/admin/orders/${order}?codes=${codes.join(',')}`);
    const j = await r.json();
    if (!r.ok) return setErr(j.message || 'โหลดไม่สำเร็จ');
    setSug(j); setAmt(String(j.amount));
  };
  const go = async () => {
    setBusy(true); setErr('');
    const r = await fetch(`/api/admin/orders/${order}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', codes, refund: mode, amount: Number(amt) || 0, reason: shop ? `ร้านยกเลิก${reason ? ' · ' + reason : ''}` : reason, source: shop ? 'closed' : 'staff' }) });
    setBusy(false);
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'ยกเลิกไม่สำเร็จ');
    setSug(null); router.refresh();
  };
  if (!sug) return <>
    <button className="btnw danger" onClick={open}>ยกเลิกการจอง</button>
    {err && <div className="err">{err}</div>}
  </>;
  return (
    <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <b>ยกเลิก {codes.length} รายการ</b>
      {sug.lines.map((l) => <div key={l.code} className="cap">{l.name} {l.code} · ล่วงหน้า {l.days} วัน → คืน {l.pct}% ({baht(l.amount)})</div>)}
      <div className="cap">ลูกค้าจ่ายแล้ว {baht(sug.paid)} · ตามเงื่อนไขคืน {baht(sug.amount)}</div>
      <button className={'tagchip' + (shop ? ' on' : '')} style={{ justifyContent: 'flex-start' }} onClick={() => { setShop(!shop); if (!shop) setAmt(String(sug.paid)); else setAmt(String(sug.amount)); }}>
        ร้านยกเลิกเอง (ฝนตก ซ่อม ปิดร้าน) · คืนเต็ม
      </button>
      {sug.paid > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {MODES.map(([k, l]) => <button key={k} className={'tagchip' + (mode === k ? ' on' : '')} onClick={() => setMode(k)}>{l}</button>)}
      </div>}
      {sug.paid > 0 && mode !== 'forfeit' && <label className="cap">ยอดที่คืน (บาท)<input className="input num" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></label>}
      <label className="cap">เหตุผล (แจ้งลูกค้า)<input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ลูกค้าขอยกเลิก" /></label>
      {mode === 'refund' && sug.paid > 0 && <div className="note">บันทึกเป็น "รอโอนคืน" · โอนเสร็จแล้วกด "โอนคืนแล้ว" ในหน้านี้</div>}
      {err && <div className="err">{err}</div>}
      <button className="btnw" style={{ background: 'var(--red)', color: '#fff' }} disabled={busy} onClick={go}>{busy ? 'กำลังยกเลิก…' : 'ยืนยันยกเลิก · แจ้งลูกค้า'}</button>
      <button className="btnw line" onClick={() => setSug(null)}>ไม่ยกเลิก</button>
    </div>
  );
}

export function MarkRefunded({ order, amount }: { order: string; amount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button className="btnw dark" disabled={busy} onClick={async () => {
    setBusy(true);
    await fetch(`/api/admin/orders/${order}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'refunded' }) });
    setBusy(false); router.refresh();
  }}>{busy ? 'รอสักครู่…' : `โอนคืนแล้ว ${baht(amount)}`}</button>;
}

// รับเงินส่วนที่เหลือที่ร้าน
export function CollectAtShop({ order, owe }: { order: string; owe: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(String(owe));
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!(owe > 0)) return null;
  if (!open) return <button className="btnw dark" onClick={() => setOpen(true)}>รับเงินที่ร้าน {baht(owe)}</button>;
  return (
    <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <b>รับเงินส่วนที่เหลือ</b>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className={'tagchip' + (method === 'cash' ? ' on' : '')} onClick={() => setMethod('cash')}>เงินสด</button>
        <button className={'tagchip' + (method === 'transfer' ? ' on' : '')} onClick={() => setMethod('transfer')}>โอน (เห็นเงินเข้าแล้ว)</button>
      </div>
      <label className="cap">ยอดที่รับ<input className="input num" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
      {err && <div className="err">{err}</div>}
      <button className="btnw green" disabled={busy} onClick={async () => {
        setBusy(true); setErr('');
        const r = await fetch(`/api/admin/orders/${order}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'collect', amount: Number(amt), method }) });
        setBusy(false);
        if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'บันทึกไม่สำเร็จ');
        setOpen(false); router.refresh();
      }}>{busy ? 'รอสักครู่…' : 'บันทึกรับเงิน'}</button>
    </div>
  );
}
