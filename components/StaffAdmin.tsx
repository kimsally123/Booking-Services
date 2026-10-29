'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type S = { code: string; display_name: string; role: string; businesses: string[]; is_groomer: boolean; invite_status: string; linked: boolean; invite_open: boolean };
const ROLE: Record<string, string> = { owner: 'เจ้าของ', manager: 'ผู้จัดการ', staff: 'หน้าร้าน' };

export default function StaffAdmin({ me, staff, businesses }: { me: string; staff: S[]; businesses: { code: string; name: string }[] }) {
  const router = useRouter();
  const [link, setLink] = useState<{ code: string; url: string } | null>(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ display_name: '', role: 'staff', businesses: [] as string[], is_groomer: false });
  const [confirmRm, setConfirmRm] = useState('');

  const call = async (body: object) => {
    setErr('');
    const r = await fetch('/api/admin/staff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.message || 'ทำรายการไม่สำเร็จ'); return null; }
    return j;
  };
  const bizName = (c: string) => (c === 'all' ? 'ทุกธุรกิจ' : businesses.find((b) => b.code === c)?.name ?? c);

  return (
    <>
      <div className="cap">{staff.filter((x) => x.invite_status !== 'removed').length} คน · เชิญด้วยลิงก์ → พนักงานเปิดใน LINE ครั้งเดียว ระบบผูกบัญชีให้ · ลิงก์ใช้ได้ 72 ชม. ครั้งเดียว</div>
      {err && <div className="err">{err}</div>}
      <div>
        {staff.map((s) => (
          <div key={s.code} className="row" style={{ opacity: s.invite_status === 'removed' ? 0.45 : 1, flexWrap: 'wrap' }}>
            <span className="t">
              <b>{s.display_name}</b>
              <small>{s.businesses.map(bizName).join(', ')} · {s.invite_status === 'removed' ? 'ลบแล้ว' : s.linked ? 'ผูก LINE แล้ว' : s.invite_open ? 'ส่งลิงก์แล้ว รอเปิด' : 'ยังไม่ได้เชิญ'}</small>
            </span>
            <span className="pill" style={{ background: s.role === 'owner' ? 'var(--ink)' : s.role === 'manager' ? 'var(--amber-soft)' : s.is_groomer ? '#FBE3E4' : 'var(--soft)', color: s.role === 'owner' ? '#fff' : s.role === 'manager' ? 'var(--amber)' : s.is_groomer ? 'var(--red-ink)' : 'var(--ink)' }}>
              {s.is_groomer && s.role === 'staff' ? 'ช่าง' : ROLE[s.role]}
            </span>
            {s.invite_status !== 'removed' && (
              <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                <button className="pbtn" style={{ background: 'var(--soft)', color: 'var(--ink)' }}
                  onClick={async () => { const j = await call({ action: 'invite', code: s.code }); if (j) setLink({ code: s.code, url: j.link }); router.refresh(); }}>
                  {s.linked ? 'เชิญใหม่ (เปลี่ยนเครื่อง)' : 'สร้างลิงก์เชิญ'}
                </button>
                {s.code !== me && (confirmRm === s.code
                  ? <button className="pbtn" style={{ background: 'var(--red)' }} onClick={async () => { await call({ action: 'remove', code: s.code }); setConfirmRm(''); router.refresh(); }}>ยืนยันลบ</button>
                  : <button className="pbtn" style={{ background: 'var(--soft)', color: 'var(--red-ink)' }} onClick={() => setConfirmRm(s.code)}>ลบ</button>)}
              </div>
            )}
          </div>
        ))}
      </div>
      {link && (
        <div className="note y" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b>ลิงก์เชิญ {staff.find((s) => s.code === link.code)?.display_name} (แสดงครั้งเดียว ส่งให้พนักงานทาง LINE)</b>
          <code style={{ wordBreak: 'break-all', fontSize: 12 }}>{link.url}</code>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="pbtn" href={`https://line.me/R/share?text=${encodeURIComponent(`ลิงก์เข้าหลังบ้านสำหรับพนักงาน (ใช้ได้ครั้งเดียว ภายใน 72 ชม.)\nกดเปิดใน LINE: ${link.url}`)}`}>ส่งทาง LINE</a>
            <button className="pbtn" onClick={() => navigator.clipboard?.writeText(link.url)}>คัดลอก</button>
          </div>
          <small className="cap">พนักงานกดลิงก์ใน LINE แล้วยืนยันตัวตน ระบบผูกบัญชีและเปลี่ยนเมนูในแชทของเขาเป็นเมนูพนักงานให้เอง (ต้องเพิ่มเพื่อน OA ก่อน)</small>
        </div>
      )}
      <span className="cap">เชิญพนักงาน</span>
      <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <input className="input" placeholder="ชื่อ" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        <div className="segbox">{['staff', 'manager', 'owner'].map((r) => <button key={r} className={form.role === r ? 'on' : ''} onClick={() => setForm({ ...form, role: r })}>{ROLE[r]}</button>)}</div>
        <div className="seg">
          {businesses.map((b) => (
            <button key={b.code} className={form.businesses.includes(b.code) ? 'on' : ''}
              onClick={() => setForm({ ...form, businesses: form.businesses.includes(b.code) ? form.businesses.filter((x) => x !== b.code) : [...form.businesses, b.code] })}>{b.name}</button>
          ))}
        </div>
        <label className="cap" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={form.is_groomer} onChange={(e) => setForm({ ...form, is_groomer: e.target.checked })} /> เป็นช่าง Grooming (เวลาทำงานเริ่มต้น อ.–อา. 10:00–19:00)</label>
        <button className="btnw dark" onClick={async () => { if (await call({ action: 'add', ...form })) { setForm({ display_name: '', role: 'staff', businesses: [], is_groomer: false }); router.refresh(); } }}>+ เพิ่ม แล้วสร้างลิงก์เชิญทาง LINE</button>
      </div>
      <div className="note">บทบาทกำหนดสิทธิ์เริ่มต้น · เจ้าของเห็นทุกอย่าง · ผู้จัดการแก้ตั้งค่าธุรกิจที่ดูแล · หน้าร้านทำงานประจำวัน</div>
    </>
  );
}
