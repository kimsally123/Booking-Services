'use client';
import { useState } from 'react';
import { addDays, addMonths, isoDow, monthEnd, monthStart, thMonth } from '@/lib/thaidate';

// ปฏิทินรายเดือนฝั่งลูกค้า · เลื่อนดูได้ถึงเดือน until · แตะวันที่กดไม่ได้ = บอกเหตุผล
export type Cell = {
  kind: 'free' | 'full' | 'off';   // off = ร้านปิด / ผ่านไปแล้ว / เกินช่วงที่จองได้ (ขีดฆ่า)
  sub?: string;                    // ใต้ตัวเลข: "ว่าง 3" · "2 รอบ" · "4.5k" · "เต็ม"
  pick: boolean;                   // แตะได้ไหม
  reason?: string;                 // เหตุผลตอนแตะไม่ได้
};
export type Mark = 'one' | 'start' | 'end' | 'in' | null;

const WD = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

export default function Calendar({ today, until, focus, cell, mark, onPick, onBlocked }: {
  today: string; until: string; focus?: string | null;
  cell: (d: string) => Cell; mark: (d: string) => Mark;
  onPick: (d: string) => void; onBlocked: (msg: string) => void;
}) {
  const first = monthStart(today), lastM = monthStart(until);
  const [m, setM] = useState(() => {
    const f = focus && focus >= today && focus <= until ? monthStart(focus) : first;
    return f;
  });
  const start = m, end = monthEnd(m);
  const lead = isoDow(start) - 1;                         // เริ่มสัปดาห์วันจันทร์
  const cells: (string | null)[] = [...Array(lead).fill(null)];
  for (let d = start; d <= end; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);

  return (
    <div className="cal">
      <div className="cal-h">
        <button aria-label="เดือนก่อน" disabled={m <= first} onClick={() => setM(addMonths(m, -1))}><span className="ms">chevron_left</span></button>
        <b>{thMonth(m)}</b>
        <button aria-label="เดือนถัดไป" disabled={m >= lastM} onClick={() => setM(addMonths(m, 1))}><span className="ms">chevron_right</span></button>
      </div>
      <div className="cal-g">
        {WD.map((w) => <span key={w} className="wd">{w}</span>)}
        {cells.map((d, k) => {
          if (!d) return <span key={k} />;
          const c = cell(d), mk = mark(d);
          const cls = ['d', c.kind, mk ?? '', d === today ? 'today' : ''].filter(Boolean).join(' ');
          return (
            <button key={d} className={cls} aria-disabled={!c.pick}
              onClick={() => (c.pick ? onPick(d) : c.reason && onBlocked(c.reason))}>
              <b className="num">{Number(d.slice(8))}</b>
              <small>{c.kind === 'off' ? '' : c.sub ?? ''}</small>
            </button>
          );
        })}
      </div>
      <div className="cal-k">
        <span><i className="k-sel" />ที่เลือก</span>
        <span><i className="k-full" />เต็ม</span>
        <span><i className="k-off" />ร้านปิด</span>
        <span><i className="k-today" />วันนี้</span>
      </div>
    </div>
  );
}
