'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { baht } from '@/lib/thaidate';

// เหตุผลไม่ผ่าน (ไม่ผ่านครั้งที่ 2 ระบบยกเลิกการจอง ตามระบบเดิม M19.1)
const REASONS: [string, string][] = [['not_found', 'ไม่พบเงินเข้าบัญชี'], ['wrong_order', 'สลิปไม่ใช่ของการจองนี้'], ['other', 'รูปไม่ชัด / อ่านไม่ได้']];

type Act = 'approve' | 'partial' | 'reject' | 'reopen';

// เทียบยอด แล้วกด ผ่าน / ได้บางส่วน / ไม่ผ่าน (ปุ่มติดล่างตามโปรโตไทป์)
export default function SlipDecision({ code, due, got, slip, rejects }: { code: string; due: number; got: number; slip: number | null; rejects: number }) {
  const router = useRouter();
  const left = Math.round((due - got) * 100) / 100;
  const [amt, setAmt] = useState(slip === null ? '' : String(slip));
  const [sheet, setSheet] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const n = amt === '' ? null : Number(amt);
  const short = n !== null && n + 0.005 < left;
  const over = n !== null && n - 0.005 > left;
  const act = async (action: Act) => {
    setBusy(action); setErr('');
    const r = await fetch(`/api/admin/payments/${code}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, amount_slip: n, reason: action === 'reject' ? reason[1] : null, reject_kind: action === 'reject' ? reason[0] : null }) });
    setBusy('');
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'ทำรายการไม่สำเร็จ');
    router.push('/admin/slips'); router.refresh();
  };
  return (
    <>
      {got > 0 && <div className="note y">ได้รับจากสลิปก่อนหน้าแล้ว {baht(got)} · ใบนี้ควรเป็นส่วนที่ขาด {baht(left)}</div>}
      {short && <div className="err">ยอดขาด {baht(left - n!)} · กด "ได้บางส่วน" ระบบจะแจ้งลูกค้าให้โอนส่วนที่ขาด</div>}
      {over && <div className="note y">ยอดเกิน {baht(n! - left)} · ผ่านได้ แล้วคืนส่วนเกินนอกระบบ</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr 24px', gap: 8, alignItems: 'center', fontSize: 15 }}>
        <span /><small className="cap">ควรได้</small><small className="cap">ในสลิป</small><span />
        <span className="cap">ยอด</span><b className="num">{baht(left)}</b>
        <input className="input num" inputMode="decimal" placeholder="ดูจากสลิป" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ color: short ? 'var(--red-ink)' : undefined, fontWeight: 800 }} />
        <span className="ms" style={{ color: short ? 'var(--red-ink)' : n !== null ? 'var(--green)' : 'var(--ink-3)' }}>{short ? 'flag' : 'check_circle'}</span>
      </div>
      <div className="note">ต้องเห็นเงินเข้าในแอปธนาคารของร้านก่อนกดผ่านทุกครั้ง · เทียบชื่อผู้รับและเลขอ้างอิง</div>
      {err && <div className="err">{err}</div>}
      {sheet && (
        <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <b>เหตุผลที่ไม่ผ่าน (แจ้งลูกค้าใน LINE)</b>
          {rejects >= 1 && <div className="err">การจองนี้เคยไม่ผ่านแล้ว {rejects} ครั้ง · กดไม่ผ่านครั้งนี้ระบบจะยกเลิกการจอง</div>}
          {REASONS.map((r) => <button key={r[0]} className={'tagchip' + (reason[0] === r[0] ? ' on' : '')} style={{ justifyContent: 'flex-start' }} onClick={() => setReason(r)}>{r[1]}</button>)}
          <button className="btnw" style={{ background: 'var(--red)', color: '#fff' }} disabled={!!busy} onClick={() => act('reject')}>{busy === 'reject' ? 'รอสักครู่…' : 'ส่งผลไม่ผ่าน'}</button>
        </div>
      )}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 64, zIndex: 6, background: 'var(--bg)', borderTop: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '12px 18px', display: 'flex', gap: 10 }}>
          <button className="btnw line" style={{ flex: 1 }} onClick={() => setSheet(!sheet)}><span className="ms">close</span>ไม่ผ่าน</button>
          {short
            ? <button className="btnw dark" style={{ flex: 1.3 }} disabled={!!busy} onClick={() => act('partial')}>{busy === 'partial' ? 'รอสักครู่…' : 'ได้บางส่วน'}</button>
            : <button className="btnw green" style={{ flex: 1.3 }} disabled={!!busy || n === null} onClick={() => act('approve')}><span className="ms">check</span>{busy === 'approve' ? 'รอสักครู่…' : 'ผ่าน'}</button>}
        </div>
      </div>
      <div style={{ height: 80 }} />
    </>
  );
}

// แก้ผลที่กดไปแล้ว (ไม่ผ่าน/ได้บางส่วน → กลับเป็นรอตรวจ)
export function ReopenSlip({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <>
      {err && <div className="err">{err}</div>}
      <button className="btnw line" disabled={busy} onClick={async () => {
        setBusy(true); setErr('');
        const r = await fetch(`/api/admin/payments/${code}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reopen' }) });
        setBusy(false);
        if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'แก้ผลไม่สำเร็จ');
        router.refresh();
      }}>{busy ? 'รอสักครู่…' : 'แก้ผล (กดผิด) · กลับไปรอตรวจ'}</button>
    </>
  );
}
