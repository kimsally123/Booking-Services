'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PetForm({ back, tags }: { back: string | null; tags: string[] }) {
  const router = useRouter();
  const [f, setF] = useState({ name: '', species: 'dog', breed: '', weight_kg: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [my, setMy] = useState<string[]>([]);
  const [own, setOwn] = useState('');
  const toggle = (t: string) => setMy((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));
  const save = async () => {
    setBusy(true); setErr('');
    const r = await fetch('/api/me/pets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, weight_kg: Number(f.weight_kg), tags: own.trim() ? [...my, own.trim()] : my }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.message || 'เพิ่มไม่สำเร็จ');
    router.replace(`/me/pets/${j.code}${back ? `?back=${encodeURIComponent(back)}` : ''}`);
  };
  return (
    <>
      <button className="back" onClick={() => router.back()}><span className="ms">arrow_back</span></button>
      <div className="title">เพิ่มน้อง</div>
      <input className="input" placeholder="ชื่อน้อง" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="segbox">{[['dog', 'หมา'], ['cat', 'แมว']].map(([k, l]) => <button key={k} className={f.species === k ? 'on' : ''} onClick={() => setF({ ...f, species: k })}>{l}</button>)}</div>
      <input className="input" placeholder="สายพันธุ์ (ไม่บังคับ)" value={f.breed} onChange={(e) => setF({ ...f, breed: e.target.value })} />
      <input className="input" inputMode="decimal" placeholder="น้ำหนัก (กก.)" value={f.weight_kg} onChange={(e) => setF({ ...f, weight_kg: e.target.value })} />
      <div className="cap">น้ำหนักใช้คิดราคา Grooming และแบ่งรอบสระ</div>
      <div className="grp">ข้อควรระวัง (ร้านเห็น)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {tags.map((t) => <button key={t} className={'tagchip' + (my.includes(t) ? ' on' : '')} onClick={() => toggle(t)}>{t}</button>)}
      </div>
      <input className="input" placeholder="อื่น ๆ พิมพ์เอง (ไม่บังคับ)" maxLength={30} value={own} onChange={(e) => setOwn(e.target.value)} />
      <div className="note y"><span className="ms">vaccines</span> เตรียมสมุดวัคซีนมาด้วยนะ · ถ่ายรูปส่งได้ในหน้าถัดไป (สระและ Pet hotel ต้องมีวัคซีนที่ยังไม่หมดอายุ)</div>
      {err && <div className="err">{err}</div>}
      <button className="btnw dark" disabled={busy || !f.name || !f.weight_kg} onClick={save}>{busy ? 'รอสักครู่…' : 'บันทึก'}</button>
    </>
  );
}
