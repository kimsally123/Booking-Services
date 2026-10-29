'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ปิดรอบสระฉุกเฉินวันนี้ + แจ้งลูกค้าที่จองรอบนี้ (ร้านเลื่อน/คืนเงินเต็มต่อในหน้าการจอง)
export default function CloseRound({ biz, session, date, label }: { biz: string; session: string; date: string; label: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!ask) return <button className="tagchip" onClick={(e) => { e.preventDefault(); setAsk(true); }}>ปิดรอบ</button>;
  return (
    <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }} onClick={(e) => e.preventDefault()}>
      <b>ปิดรอบ {label} วันนี้</b>
      <input className="input" placeholder="เหตุผล เช่น ฝนตก / ทำความสะอาดสระ" value={reason} onChange={(e) => setReason(e.target.value)} />
      {err && <div className="err">{err}</div>}
      <button className="btnw" style={{ background: 'var(--red)', color: '#fff' }} disabled={busy} onClick={async () => {
        setBusy(true); setErr('');
        const r = await fetch('/api/admin/settings', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'closure.add', business_code: biz, session_code: session, date_from: date, date_to: date, reason: reason || 'ปิดรอบฉุกเฉิน', notify: true }) });
        setBusy(false);
        if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'ปิดไม่สำเร็จ');
        setAsk(false); router.refresh();
      }}>{busy ? 'รอสักครู่…' : 'ปิดรอบและแจ้งลูกค้า'}</button>
      <button className="btnw line" onClick={() => setAsk(false)}>ไม่ปิด</button>
    </div>
  );
}
