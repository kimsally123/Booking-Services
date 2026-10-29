'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { baht, thDate } from '@/lib/thaidate';
import type { OrderView } from '@/lib/types';
import { TopBar } from './ui';

type Order = OrderView;

const pad = (n: number) => String(n).padStart(2, '0');
const balanceMode = (o: Order) => o.status === 'paid' && Number(o.balance_due) > 0 && o.last_payment?.status !== 'pending';
const remain = (o: Order) => balanceMode(o) ? Number(o.balance_due) : Math.round((Number(o.due_now) - Number(o.paid_amount || 0)) * 100) / 100;

// ส่งข้อความในนามลูกค้าเข้าแชท OA (ต้องเปิด scope chat_message.write ใน LIFF) · ไม่ได้ = เปิดแชทพร้อมข้อความให้กดส่งเอง
async function sendToChat(liffId: string | null, oa: string | null, text: string) {
  if (liffId) {
    try {
      const liff = (await import('@line/liff')).default;
      await liff.init({ liffId });
      if (liff.isInClient()) { await liff.sendMessages([{ type: 'text', text }]); liff.closeWindow(); return; }
    } catch { /* ไปใช้ลิงก์แชทแทน */ }
  }
  if (oa) location.href = `https://line.me/R/oaMessage/${encodeURIComponent(oa.startsWith('@') ? oa : '@' + oa)}/?${encodeURIComponent(text)}`;
}

export default function PayBox({ order, qr, account, shop, liffId, oa }: { order: Order; qr: string; account: string; shop: string; liffId?: string | null; oa?: string | null }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!order.hold_until || order.status !== 'holding') return;
    const end = new Date(order.hold_until).getTime();
    const t = setInterval(() => setLeft(Math.max(0, Math.floor((end - Date.now()) / 1000))), 1000);
    setLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    return () => clearInterval(t);
  }, [order.hold_until, order.status]);

  const upload = async (f: File) => {
    setBusy(true); setErr('');
    const fd = new FormData(); fd.append('slip', f);
    const r = await fetch(`/api/orders/${order.code}/slip`, { method: 'POST', body: fd });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).message || 'แนบสลิปไม่สำเร็จ'); return; }
    router.refresh();
  };

  // บันทึก QR เป็นรูปเดียวที่มียอด ชื่อบัญชี และรหัสการจอง (ไว้เปิดสแกนในแอปธนาคาร)
  // มือถือ: เปิดเมนูแชร์ → "บันทึกรูปภาพ" · ไม่รองรับ (เช่นในแอป LINE บางรุ่น) = ดาวน์โหลด + บอกให้กดค้างที่รูป
  const [tip, setTip] = useState('');
  const saveQr = async () => {
    const img = new Image();
    img.src = qr;
    await img.decode().catch(() => {});
    const W = 720, H = 980, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const font = getComputedStyle(document.body).fontFamily;
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#111'; g.textAlign = 'center';
    g.font = `700 30px ${font}`; g.fillText(shop, W / 2, 70);
    g.font = `800 64px ${font}`; g.fillText(baht(remain(order)), W / 2, 150);
    g.drawImage(img, 80, 190, 560, 560);
    g.font = `400 28px ${font}`; g.fillStyle = '#555';
    if (account) g.fillText(`โอนเข้า ${account}`, W / 2, 810);
    g.fillText(`รหัสการจอง ${order.code}`, W / 2, 860);
    g.font = `400 22px ${font}`; g.fillText('สแกนด้วยแอปธนาคาร แล้วกลับมาแนบสลิป', W / 2, 920);
    const blob: Blob | null = await new Promise((ok) => c.toBlob(ok, 'image/png'));
    if (!blob) return;
    const f = new File([blob], `QR-${order.code}.png`, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f] }); return; }
    } catch (e) { if ((e as Error).name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = f.name; a.click();
    setTip('ถ้ารูปไม่ถูกบันทึก ให้กดค้างที่รูป QR แล้วเลือก "บันทึกรูปภาพ"');
  };
  const bal = balanceMode(order);
  const expired = !bal && (order.status === 'expired' || order.late || left === 0);
  const waiting = order.status === 'pending_review';
  const paid = order.status === 'paid';

  // ส่งสลิปแล้ว → หน้าสำเร็จ พาไปดูการจอง
  if (waiting || (paid && !bal && order.last_payment?.status === 'pending')) return (
    <main className="app">
      <TopBar title="ชำระเงิน" step={order.code} onBack={() => router.push('/me')} />
      <div className="body" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12, minHeight: '70vh' }}>
        <span className="empty-ic" style={{ width: 64, height: 64, borderRadius: 32, display: 'grid', placeItems: 'center', background: 'var(--amber-bg, #FDF5DC)' }}>
          <span className="ms" style={{ fontSize: 32, color: '#8A5A00' }}>hourglass_top</span></span>
        <b style={{ fontSize: 20, fontWeight: 800 }}>ส่งสลิปแล้ว</b>
        <div className="sub" style={{ maxWidth: 260 }}>ร้านกำลังตรวจ · ผลจะแจ้งในแชท LINE</div>
        {(liffId || oa) && <button className="btn" style={{ minWidth: 220 }} onClick={() => sendToChat(liffId ?? null, oa ?? null, `ยืนยันการจอง ${order.code}`)}>ส่งยืนยันการจองเข้าแชท</button>}
        <div className="cap" style={{ maxWidth: 260 }}>ส่งแล้วจะได้การ์ดสถานะการจองในแชท · ส่งรหัส {order.code} เมื่อไหร่ก็เช็กสถานะได้</div>
        <a className="btn ghost" href={`/me/b/${order.code}`} style={{ minWidth: 220 }}>ดูการจองของฉัน</a>
      </div>
    </main>
  );

  return (
    <main className="app">
      <TopBar title="ชำระเงิน" step={order.code} onBack={() => router.push('/me')} />
      <div className="body" style={{ alignItems: 'stretch' }}>
        {order.status === 'holding' && !expired && (liffId || oa) && (
          <div className="card on" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <span className="t"><b style={{ fontSize: 16 }}>ยืนยันการจองผ่านแชท</b>
              <small>ส่งรหัส {order.code} เข้าแชทร้าน แล้วรับการ์ดการจองพร้อม QR พร้อมเพย์ เก็บไว้โอนทีหลังได้ · ส่งรหัสเมื่อไหร่ก็เช็กสถานะได้</small></span>
            <button className="btn" onClick={() => sendToChat(liffId ?? null, oa ?? null, `ยืนยันการจอง ${order.code}`)}>ยืนยันการจองผ่านแชท</button>
          </div>
        )}
        {bal && <div className="warn"><span className="ms">info</span>มัดจำผ่านแล้ว · ชำระยอดคงเหลือภายใน {order.balance_due_by ? thDate(order.balance_due_by) : 'ก่อนวันเข้าพัก'}</div>}
        {paid && !bal && order.last_payment?.status === 'pending' && <div className="warn"><span className="ms">schedule</span>แนบสลิปยอดคงเหลือแล้ว รอร้านตรวจ</div>}
        {paid && !bal && <div className="card on"><span className="ms ok">check</span><span className="t"><b>ยืนยันการจองแล้ว</b><small>ร้านตรวจสลิปเรียบร้อย</small></span></div>}
        {waiting && <div className="warn"><span className="ms">schedule</span>แนบสลิปแล้ว รอร้านตรวจ · ผลจะแจ้งในแชท LINE</div>}
        {expired && !waiting && !paid && <div className="err">หมดเวลากันที่แล้ว กรุณาจองใหม่</div>}
        {order.last_payment?.status === 'rejected' && order.status === 'holding' && (
          <div className="err">สลิปก่อนหน้าไม่ผ่าน: {order.last_payment.reason} · แนบสลิปใหม่ได้</div>
        )}

        {(order.status === 'holding' || bal) && !expired && (
          <>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <div className="sub">สแกนจ่าย · {shop}</div>
              <div className="num" style={{ fontSize: 36, fontWeight: 800 }}>{baht(remain(order))}</div>
              {Number(order.paid_amount) > 0 && <div className="sub">ร้านได้รับแล้ว {baht(Number(order.paid_amount))} · โอนเพิ่มอีก {baht(remain(order))}</div>}
              {left !== null && !bal && <div style={{ color: 'var(--red-ink)', fontSize: 14, fontWeight: 700 }}>กันที่ไว้ให้อีก {pad(Math.floor(left / 60))}:{pad(left % 60)} นาที</div>}
              <div style={{ width: 230, height: 230, border: '2px solid var(--ink)', borderRadius: 16, padding: 10, background: '#fff', display: 'grid', placeItems: 'center' }}>
                {qr ? <img src={qr} alt={`QR พร้อมเพย์ ${baht(remain(order))}`} style={{ width: '100%', height: '100%' }} />
                    : <span style={{ color: '#9a9a96', fontSize: 14 }}>ร้านยังไม่ได้ตั้งเลขพร้อมเพย์</span>}
              </div>
              {account && <div className="sub">โอนเข้า {account}</div>}
            </div>
            <ol className="sub" style={{ paddingLeft: 20 }}>
              <li>บันทึกรูป QR หรือสแกนจากแอปธนาคาร</li>
              <li>โอนยอดตามที่แสดง</li>
              <li>กลับมาแนบสลิปที่นี่</li>
            </ol>
            {tip && <div className="warn"><span className="ms">info</span>{tip}</div>}
            {err && <div className="err">{err}</div>}
          </>
        )}

        <div className="section">รายการในทริปนี้</div>
        <div className="bill">
          {order.items.map((i) => (
            <div key={i.code} className="l"><span>{i.biz} · {i.item}{i.pets ? ` · ${i.pets}` : ''}<br /><small>{thDate(i.s.slice(0, 10))} {i.s.slice(11)}</small></span><span className="num">{baht(i.price)}</span></div>
          ))}
          <hr />
          <div className="l tot"><span>รวม</span><span className="num">{baht(order.total)}</span></div>
          <div className="l"><span>มัดจำ</span><span className="num">{baht(order.due_now)}</span></div>
          {order.total > order.due_now && <div className="l"><span>จ่ายที่ร้าน</span><span className="num">{baht(order.total - order.due_now)}</span></div>}
        </div>
      </div>
      {(order.status === 'holding' || bal) && !expired && (
        <div className="bottombar"><div className="in">
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button className="btn ghost" disabled={!qr} onClick={saveQr}><span className="ms">download</span>บันทึก QR</button>
          <button className="btn red" style={{ flex: 1 }} disabled={busy} onClick={() => file.current?.click()}>
            <span className="ms">upload</span>{busy ? 'กำลังส่ง…' : 'แนบสลิป'}
          </button>
        </div></div>
      )}
    </main>
  );
}
