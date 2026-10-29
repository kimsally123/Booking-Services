'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// พนักงานล็อกอินด้วย LINE (ผ่าน LIFF) · mode=join ใช้ลิงก์เชิญครั้งแรก
export default function StaffLoginClient({ liffId, mode, token }: { liffId: string | null; mode: 'join' | 'login'; token?: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState(liffId ? 'กำลังเข้าสู่ระบบด้วย LINE…' : 'ยังไม่ได้ใส่ LIFF ID · เจ้าของใส่ได้ที่ ตั้งค่า → รับเงินและข้อมูลร้าน');
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!liffId) return;
    (async () => {
      try {
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId: liffId! });
        if (!liff.isLoggedIn()) { liff.login({ redirectUri: window.location.href }); return; }
        const idToken = liff.getIDToken();
        const r = await fetch(mode === 'join' ? '/api/staff/join' : '/api/staff/login', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken, token }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setErr(true); setMsg(j.message || 'เข้าสู่ระบบไม่สำเร็จ'); return; }
        if (mode === 'join') router.replace(j.menu ? '/admin?welcome=menu' : '/admin?welcome=1'); else router.refresh();
      } catch (e) {
        setErr(true); setMsg((e as Error).message || 'เข้าสู่ระบบไม่สำเร็จ');
      }
    })();
  }, [liffId, mode, token, router]);

  return (
    <main className="admin" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 80 }}>
      <div className="h1">หลังบ้าน</div>
      <div className={err ? 'err' : 'sub'}>{msg}</div>
      {err && mode === 'login' && <div className="sub">ถ้ายังไม่เคยเข้า ขอลิงก์เชิญจากเจ้าของร้าน</div>}
    </main>
  );
}
