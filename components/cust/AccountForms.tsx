'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const patch = (body: object) => fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export function Back() {
  const router = useRouter();
  return <button className="back" onClick={() => router.push('/me/account')}><span className="ms">arrow_back</span></button>;
}

export function ProfileForm({ c }: { c: { display_name: string; phone: string | null; email: string | null; line: boolean } }) {
  const router = useRouter();
  const [f, setF] = useState({ display_name: c.display_name, phone: c.phone ?? '', email: c.email ?? '' });
  const [msg, setMsg] = useState('');
  const save = async () => {
    const r = await patch(f);
    setMsg(r.ok ? 'บันทึกแล้ว' : (await r.json().catch(() => ({}))).message || 'บันทึกไม่สำเร็จ');
    router.refresh();
  };
  return (
    <>
      <div className="li" style={{ padding: '10px 0' }}><span className="ms">chat</span><span className="t"><b>บัญชี LINE</b><small>{c.line ? 'เชื่อมแล้ว ✓' : 'ยังไม่ได้เชื่อม'}</small></span></div>
      <label className="cap">ชื่อที่ให้ร้านเรียก<input className="input" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></label>
      <label className="cap">เบอร์โทร<input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
      <label className="cap">อีเมล (ไม่บังคับ)<input className="input" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      {msg && <div className="note">{msg}</div>}
      <button className="btnw dark" onClick={save}>บันทึก</button>
    </>
  );
}

export function PdpaForm({ news, photo, requested }: { news: boolean; photo: boolean; requested: boolean }) {
  const router = useRouter();
  const [n, setN] = useState(news);
  const [p, setP] = useState(photo);
  const [ask, setAsk] = useState(false);
  const [done, setDone] = useState(requested);
  const set = async (k: 'consent_news' | 'consent_photo', v: boolean) => { (k === 'consent_news' ? setN : setP)(v); await patch({ [k]: v }); };
  const Row = ({ t, s, on, k }: { t: string; s: string; on: boolean; k: 'consent_news' | 'consent_photo' }) => (
    <div className="row"><span className="t"><b>{t}</b><small>{s}</small></span>
      <button className={'switch' + (on ? ' on' : '')} aria-pressed={on} onClick={() => set(k, !on)} /></div>
  );
  return (
    <>
      <div className="note y">เปลี่ยนได้ตลอด มีผลทันที</div>
      <div className="row"><span className="t"><b>ใช้ข้อมูลเพื่อการจอง</b><small>จำเป็นต่อการให้บริการ</small></span><span className="cap" style={{ fontSize: 15 }}>เปิดเสมอ</span></div>
      <Row t="รับข่าวสารและโปรโมชัน" s="ส่งใน LINE ไม่เกินเดือนละ 2 ครั้ง" on={n} k="consent_news" />
      <Row t="ให้ร้านโพสต์รูปน้อง" s="ใช้ในโซเชียลของร้าน" on={p} k="consent_photo" />
      {done ? <div className="note">ส่งคำขอลบข้อมูลแล้ว ร้านจะติดต่อกลับทางแชท LINE</div>
        : ask ? <button className="btnw danger" onClick={async () => { const r = await fetch('/api/me/delete-request', { method: 'POST' }); if (r.ok) { setDone(true); router.refresh(); } }}>ยืนยันขอลบข้อมูลทั้งหมด</button>
        : <button className="btnw line" onClick={() => setAsk(true)}>ขอลบข้อมูลทั้งหมด</button>}
    </>
  );
}
