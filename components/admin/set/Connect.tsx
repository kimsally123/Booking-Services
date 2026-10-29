'use client';
import { useState } from 'react';
import { Switch, useSave } from './util';

type Svc = { name: string; what: string; env: string[]; ready: boolean; missing: string[]; without: string };
type Biz = { code: string; name: string; calendar_id: string | null };

// บริการนอก: บอกว่าใส่ key แล้วหรือยัง (ไม่แสดงค่า) · สวิตช์อ่านสลิป · รหัสปฏิทินต่อธุรกิจ
export default function Connect({ svcs, ocr, biz }: { svcs: Svc[]; ocr: { on: boolean; limit: string; used: number }; biz: Biz[] }) {
  const { save, Msg } = useSave();
  const [on, setOn] = useState(ocr.on);
  const [limit, setLimit] = useState(ocr.limit);
  const [cal, setCal] = useState<Record<string, string>>(Object.fromEntries(biz.map((b) => [b.code, b.calendar_id ?? ''])));
  return (
    <>
      <Msg />
      <div className="note">key ทุกตัวใส่ที่ Vercel → Settings → Environment Variables แล้วกด Redeploy · หน้านี้บอกแค่ว่าใส่แล้วหรือยัง ไม่แสดงค่า key · บริการที่ยังไม่ใส่ key ระบบยังทำงานต่อได้</div>
      <div className="list">
        {svcs.map((s) => (
          <div key={s.name} className="li" style={{ alignItems: 'flex-start' }}>
            <span className="ms" style={{ color: s.ready ? 'var(--green, #2e7d32)' : 'var(--amber)' }}>{s.ready ? 'check_circle' : 'error'}</span>
            <span className="t" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 16 }}>{s.name}</span>
              <small className="cap">{s.what}</small>
              {s.ready ? <small className="cap">พร้อมใช้</small> : <>
                <small style={{ color: 'var(--amber)' }}>ยังไม่ใส่: {s.missing.join(', ')}</small>
                <small className="cap">ระหว่างนี้: {s.without}</small>
              </>}
            </span>
          </div>
        ))}
      </div>

      <span className="cap" style={{ marginTop: 8 }}>อ่านสลิปอัตโนมัติ</span>
      <div className="row"><span className="t"><b>อ่านยอดและผู้รับในสลิป</b><small>ใช้ Google Vision · เดือนนี้ใช้ไป {ocr.used.toLocaleString('en-US')} รูป</small></span>
        <Switch on={on} onChange={(v) => { setOn(v); save('settings.save', { values: { ocr_enabled: v ? 'on' : 'off' } }, v ? 'เปิดอ่านสลิปแล้ว' : 'ปิดอ่านสลิปแล้ว'); }} /></div>
      <label className="cap">จำกัดต่อเดือน (รูป) · เกินแล้วพนักงานอ่านยอดเอง<input className="input num" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} onBlur={() => save('settings.save', { values: { ocr_month_limit: limit } })} /></label>
      <div className="note">ฟรี 1,000 รูปแรกต่อเดือน (ต้องผูกบัตรใน Google Cloud) · ทุกสลิปยังต้องให้พนักงานกดผ่านเอง</div>

      <span className="cap" style={{ marginTop: 8 }}>ปฏิทิน Google ของแต่ละธุรกิจ</span>
      {biz.map((b) => (
        <label key={b.code} className="cap">{b.name}
          <input className="input" value={cal[b.code]} placeholder="xxxx@group.calendar.google.com"
            onChange={(e) => setCal({ ...cal, [b.code]: e.target.value })}
            onBlur={() => save('calendar.save', { business_code: b.code, calendar_id: cal[b.code] })} />
        </label>
      ))}
      <div className="note">แชร์ปฏิทินให้อีเมล service account สิทธิ์ "แก้ไขกิจกรรม" ก่อน · ว่างไว้ = ธุรกิจนั้นไม่ลงปฏิทิน</div>
    </>
  );
}
