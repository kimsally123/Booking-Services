'use client';
import { useEffect } from 'react';

// หน้าเมื่อเกิดข้อผิดพลาด: บอกเลขอ้างอิงให้ร้านค้นใน Vercel Logs · กดลองใหม่ได้
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="app"><div className="body" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12, minHeight: '80vh' }}>
      <b style={{ fontSize: 20 }}>เปิดหน้านี้ไม่สำเร็จ</b>
      <div className="sub" style={{ maxWidth: 280 }}>ลองใหม่อีกครั้ง ถ้ายังไม่ได้ ทักแชทร้านพร้อมเลขอ้างอิงด้านล่าง</div>
      <button className="btn" onClick={() => reset()}>ลองใหม่</button>
      <a className="btn ghost" href="/">กลับหน้าแรก</a>
      {error.digest && <small className="cap num">เลขอ้างอิง {error.digest} · {typeof location !== 'undefined' ? location.pathname : ''}</small>}
    </div></main>
  );
}
