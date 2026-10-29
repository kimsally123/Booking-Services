'use client';
import { useEffect, useState } from 'react';

// ล็อกอินด้วย LINE (LIFF) → ส่ง ID token ให้ server ตรวจ → กลับหน้าเดิม
// ยังไม่ได้เป็นเพื่อนกับ OA → ชวนเพิ่มเพื่อนก่อน (ไม่เป็นเพื่อน = ร้านส่งข้อความยืนยัน/เตือนไม่ได้)
const safe = (p: string) => (p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/login') ? p : '/');

export default function LoginClient({ liffId, next, oa, shop }: { liffId: string | null; next: string; oa: string | null; shop: string }) {
  const [step, setStep] = useState<'wait' | 'friend' | 'err'>('wait');
  const [err, setErr] = useState('');
  const go = () => location.replace(safe(next));

  useEffect(() => {
    if (!liffId) { setStep('err'); setErr('ร้านยังไม่ได้ตั้งค่า LINE Login (LIFF ID)'); return; }
    (async () => {
      try {
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
        const idToken = liff.getIDToken();
        if (!idToken) throw new Error('ไม่ได้รับข้อมูลจาก LINE ลองเปิดใหม่จากเมนูร้าน');
        const r = await fetch('/api/auth/line', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'เข้าสู่ระบบไม่สำเร็จ');
        // เพื่อนกับ OA ไหม (ต้องผูก LINE Login channel กับ OA ไว้ · ตรวจไม่ได้ = ไปต่อ)
        const f = await liff.getFriendship().catch(() => null);
        if (f && !f.friendFlag && oa) { setStep('friend'); return; }
        go();
      } catch (e) {
        setStep('err'); setErr((e as Error).message || 'เข้าสู่ระบบไม่สำเร็จ');
      }
    })();
  }, [liffId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="app"><div className="body" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14, minHeight: '80vh' }}>
      {step === 'wait' && <div className="sub">กำลังเข้าสู่ระบบด้วย LINE…</div>}
      {step === 'err' && <>
        <div className="err">{err}</div>
        <button className="btn" onClick={() => location.reload()}>ลองใหม่</button>
      </>}
      {step === 'friend' && <>
        <span className="ms" style={{ fontSize: 40 }}>person_add</span>
        <b style={{ fontSize: 18 }}>เพิ่ม {shop} เป็นเพื่อนก่อน</b>
        <div className="sub" style={{ maxWidth: 280 }}>ร้านจะส่งข้อความยืนยันการจอง และเตือนก่อนวันนัด ทาง LINE ได้เฉพาะเมื่อเป็นเพื่อนกันแล้ว</div>
        <a className="btn" href={`https://line.me/R/ti/p/${encodeURIComponent(oa!.startsWith('@') ? oa! : '@' + oa)}`}>เพิ่มเพื่อน</a>
        <button className="btn ghost" onClick={go}>ไว้ทีหลัง</button>
      </>}
    </div></main>
  );
}
