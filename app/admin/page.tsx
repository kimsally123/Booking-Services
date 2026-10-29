import Empty from '@/components/Empty';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { currentStaff } from '@/lib/staff';
import { dayRows, nextAction, pendingCounts } from '@/lib/admin';
import { thDate, todayTH } from '@/lib/thaidate';
import { bizLook } from '@/lib/look';
import Head from '@/components/admin/Head';
import ActBtn from '@/components/admin/ActBtn';

export const dynamic = 'force-dynamic';

// หลังบ้าน · วันนี้: งานถัดไป · รอคุณจัดการ · ต่อจากนี้
export default async function Today({ searchParams }: { searchParams: Promise<{ date?: string; welcome?: string }> }) {
  const s = await currentStaff();
  if (!s) return null;
  const sp = await searchParams;
  const today = todayTH();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date || '') ? sp.date! : today;
  const [rows, cnt, [shop]] = await Promise.all([dayRows(s, date), pendingCounts(s), sql`select value from settings where key = 'shop_name'`]);
  const nowHM = date === today ? new Date(Date.now() + 7 * 3600000).toISOString().slice(11, 16) : '00:00';
  // ต่อจากนี้: งานที่ยังต้องทำวันนี้ เรียงตามเวลา
  const todo = rows.filter((r) => r.phase !== 'during' && !['done', 'no_show'].includes(r.status) && !(r.kind === 'stay' && r.phase === 'start' && r.status === 'checked_in'))
    .sort((a, b) => a.time.localeCompare(b.time));
  const nxt = todo.find((r) => nextAction(r) && r.time >= nowHM.slice(0, 2) + ':00') ?? todo.find((r) => nextAction(r));
  const checkins = rows.filter((r) => r.kind === 'stay' && r.phase === 'start');
  const ciBiz = [...new Set(checkins.map((r) => r.biz))].join(' + ');
  const look = (r: { business_code: string; color: string | null; booking_type: string }) => bizLook(r.business_code, r.color, r.booking_type);

  return (
    <>
      <Head cap={`${thDate(date)} · ${shop?.value ?? ''}`} title={date === today ? 'วันนี้' : thDate(date)} />
      {sp.welcome && <div className="note y">ยินดีต้อนรับ {s.display_name} · {sp.welcome === 'menu' ? 'ปิดหน้านี้แล้วกลับไปที่แชทร้าน เมนูด้านล่างเปลี่ยนเป็นเมนูพนักงานแล้ว' : 'ผูก LINE เรียบร้อย · เมนูพนักงานจะขึ้นในแชทหลังร้านกดติดตั้งริชเมนู'}</div>}
      {nxt && (() => { const L = look(nxt); const a = nextAction(nxt)!; return (
        <Link href={`/admin/b/${nxt.order_code}`} className="next">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="biztag" style={{ background: L.bg, color: L.fg, boxShadow: L.shadow }}><span className="ms">{L.icon}</span>{nxt.biz}</span>
            <span style={{ fontSize: 13, opacity: .8 }}>งานถัดไป · {nxt.customer}</span>
          </div>
          <div className="t">{nxt.time} · {nxt.title}</div>
          <ActBtn code={nxt.code} action={a[0]} label={a[1]} big />
        </Link>); })()}

      <div className="grp">รอคุณจัดการ</div>
      <div className="list">
        <Link href="/admin/slips" className={'li' + (cnt.slips ? ' hot' : '')}>
          <span className="ms">receipt_long</span>
          <span className="t"><b>สลิปรอตรวจ</b><small>{cnt.flagged ? `มี ${cnt.flagged} ใบยอดไม่ตรง` : cnt.slips ? 'รอตรวจ' : 'ไม่มีค้าง'}</small></span>
          <span className="n num" style={{ color: cnt.slips ? undefined : 'var(--ink-3)' }}>{cnt.slips}</span><span className="ms go">chevron_right</span>
        </Link>
        <Link href="/admin/vaccines" className="li">
          <span className="ms">vaccines</span>
          <span className="t"><b>วัคซีนรอตรวจ</b><small>{cnt.vaccines ? 'รอตรวจ' : 'ไม่มีค้าง'}</small></span>
          <span className="n num" style={{ color: cnt.vaccines ? undefined : 'var(--ink-3)' }}>{cnt.vaccines}</span><span className="ms go">chevron_right</span>
        </Link>
        {cnt.refunds.map((r) => (
          <Link key={r.code} href={`/admin/b/${r.code}`} className="li hot">
            <span className="ms">currency_exchange</span>
            <span className="t"><b>รอโอนคืน · {r.customer}</b><small>{r.code}</small></span>
            <span className="n num">฿{Number(r.amount).toLocaleString('th-TH')}</span><span className="ms go">chevron_right</span>
          </Link>))}
        <Link href="/admin/cal" className="li">
          <span className="ms">login</span>
          <span className="t"><b>เช็กอินวันนี้</b><small>{ciBiz || 'ไม่มี'}</small></span>
          <span className="n num">{checkins.length}</span><span className="ms go">chevron_right</span>
        </Link>
      </div>

      <div className="grp">ต่อจากนี้<span>{todo.length} รายการ</span></div>
      {!todo.length && <Empty tone="green" icon="task_alt" title="ไม่มีงานค้างวันนี้" text="เช็กอิน รับกลับ และคิวที่ต้องทำจะขึ้นที่นี่ตามเวลา" />}
      <div>
        {todo.map((r) => { const L = look(r); const a = nextAction(r); return (
          <Link key={r.code + r.phase} href={`/admin/b/${r.order_code}`} className="row">
            <span className="tm num">{r.time}</span>
            <span className="t">
              <span className="biztag" style={{ background: L.bg, color: L.fg, boxShadow: L.shadow }}><span className="ms">{L.icon}</span>{r.biz}</span>
              <b>{r.title}</b><small>{r.customer}{r.staff ? ` · พี่${r.staff}` : ''}{r.order_status !== 'paid' ? ' · รอสลิป' : ''}</small>
            </span>
            {a ? <ActBtn code={r.code} action={a[0]} label={a[1]} /> : <span className="cap">{r.status === 'in_progress' ? 'กำลังทำ' : r.status === 'checked_in' ? 'เข้าพักแล้ว' : ''}</span>}
          </Link>); })}
      </div>
    </>
  );
}
