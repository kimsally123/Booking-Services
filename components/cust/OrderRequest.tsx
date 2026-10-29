'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ลูกค้าขอยกเลิก/ขอเลื่อน → ร้านติดต่อกลับและดำเนินการตามเงื่อนไข
export default function OrderRequest({ code, sent }: { code: string; sent: string | null }) {
  const router = useRouter();
  const [kind, setKind] = useState<'cancel' | 'reschedule' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (sent) return <div className="note">ส่งคำขอแล้ว: {sent} · ร้านจะติดต่อกลับทางแชท</div>;
  if (!kind) return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="btnw line" style={{ flex: 1 }} onClick={() => setKind('reschedule')}>ขอเลื่อนวัน</button>
      <button className="btnw line" style={{ flex: 1 }} onClick={() => setKind('cancel')}>ขอยกเลิก</button>
    </div>
  );
  return (
    <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <b>{kind === 'cancel' ? 'ขอยกเลิกการจอง' : 'ขอเลื่อนวัน'}</b>
      <div className="cap">ร้านจะดูตามเงื่อนไขการยกเลิกและแจ้งผลในแชท · เงินคืนเป็นเครดิตเป็นค่าเริ่ม</div>
      <label className="cap">{kind === 'cancel' ? 'เหตุผล (ไม่บังคับ)' : 'อยากเลื่อนเป็นวันไหน'}<input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {err && <div className="err">{err}</div>}
      <button className="btnw dark" disabled={busy} onClick={async () => {
        setBusy(true); setErr('');
        const r = await fetch(`/api/me/orders/${code}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, note }) });
        setBusy(false);
        if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'ส่งไม่สำเร็จ');
        router.refresh();
      }}>{busy ? 'รอสักครู่…' : 'ส่งคำขอให้ร้าน'}</button>
      <button className="btnw line" onClick={() => setKind(null)}>ไม่ส่ง</button>
    </div>
  );
}
