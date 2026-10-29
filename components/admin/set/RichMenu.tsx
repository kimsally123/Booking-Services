'use client';
import { useEffect, useState } from 'react';

const TABS: [string, string][] = [['pool', 'สระว่ายน้ำ'], ['grooming', 'Grooming'], ['pet_hotel', 'Pet Hotel'], ['villa', 'Villa']];

// ติดตั้งริชเมนู 4 หน้าใน LINE OA (ใช้ LINE token ใน Vercel) · กดซ้ำได้ ระบบลบชุดเดิมให้ก่อน
export default function RichMenu({ ready, liff, keywords }: { ready: boolean; liff: string | null; keywords: string[] }) {
  const [first, setFirst] = useState('pool');
  const [st, setSt] = useState<{ installed: string[]; default: string | null } | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => fetch('/api/admin/richmenu').then((r) => r.json()).then((x) => (x.message ? setMsg(x.message) : setSt(x))).catch(() => undefined);
  useEffect(() => { if (ready) load(); }, [ready]);
  const install = async () => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/admin/richmenu', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ first }) });
    const x = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(x.message || 'ติดตั้งไม่สำเร็จ'); return; }
    setMsg('ติดตั้งแล้ว · ปิดแชทร้านแล้วเปิดใหม่เพื่อดูเมนู'); load();
  };
  const name = (c: string | null) => TABS.find((t) => t[0] === c)?.[1] ?? c;
  return (
    <>
      <div className="grp">ริชเมนู LINE · 4 หน้า</div>
      <div className="note">แถบบนสลับ สระ · Grooming · Pet Hotel · Villa · "จองเลย" และ "การจองของฉัน" เปิดหน้าเว็บผ่าน LINE (ล็อกอินให้อัตโนมัติ) · ปุ่มข้อมูลกับ "ติดต่อเจ้าหน้าที่" ส่งคีย์เวิร์ดเข้าแชท</div>
      {liff && <div className="cap">LIFF ที่ใช้: {liff} · ต้องเป็น LIFF ของระบบจองนี้ (Endpoint = โดเมนเว็บนี้) ไม่งั้นปุ่มจะเปิดแอปอื่น</div>}
      <span className="cap">ตั้งใน LINE OA Manager → ข้อความตอบกลับอัตโนมัติ · คีย์เวิร์ดต้องตรงตัวอักษร แล้วแนบรูปที่จะตอบ</span>
      <div className="list">{keywords.map((k) => <div key={k} className="li"><span className="t"><b>{k}</b></span></div>)}</div>
      {!ready ? <div className="cap">ใส่ LINE_CHANNEL_ACCESS_TOKEN และ LIFF ID ก่อน แล้วกลับมากดติดตั้ง</div> : <>
        {st && <div className="cap">{st.installed.length ? `ติดตั้งอยู่ ${st.installed.length} หน้า · หน้าแรกที่ลูกค้าเห็น: ${name(st.default) ?? '-'}` : 'ยังไม่ได้ติดตั้ง'}</div>}
        <span className="cap">หน้าแรกที่ลูกค้าเห็น</span>
        <div className="segbox">{TABS.map(([c, l]) => <button key={c} className={first === c ? 'on' : ''} onClick={() => setFirst(c)}>{l}</button>)}</div>
        <button className="btnw dark" disabled={busy} onClick={install}>{busy ? 'กำลังติดตั้ง…' : st?.installed.length ? 'ติดตั้งใหม่' : 'ติดตั้งริชเมนู'}</button>
      </>}
      {msg && <div className="cap">{msg}</div>}
    </>
  );
}
