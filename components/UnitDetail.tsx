'use client';
import { useState } from 'react';
import type { Business, Unit } from '@/lib/types';
import { photoUrl } from '@/lib/look';
import { baht } from '@/lib/thaidate';

// รายละเอียดห้อง/บ้าน: รูปเลื่อนดู (แตะเปิดเต็มจอ) · สิ่งอำนวยความสะดวก · ราคาต่อคืน · กฎ · เวลาเข้าออก
// ใช้ทั้งในขั้นเลือกห้อง (เปิดซ้อน) และหน้า /b/<ธุรกิจ>/u/<ห้อง>
const DEP = (b: Business) => b.deposit_type === 'full' ? 'จ่ายเต็มตอนจอง' : b.deposit_type === 'percent' ? `มัดจำ ${b.deposit_value}%`
  : b.deposit_type === 'first_night' ? 'มัดจำคืนแรก' : `มัดจำ ${baht(Number(b.deposit_value))}`;

export default function UnitDetail({ biz, unit, onBack, action }:
  { biz: Business; unit: Unit; onBack: () => void; action?: { label: string; onClick: () => void; sub?: string; price?: string } }) {
  const [i, setI] = useState(0);
  const [full, setFull] = useState(false);
  const photos = unit.photos.map((p) => ({ url: photoUrl(p.file), cap: p.caption })).filter((p) => p.url) as { url: string; cap: string | null }[];
  const people = biz.booking_type === 'stay' && !!unit.max_people && unit.max_people > 0 && biz.code !== 'pet_hotel';
  return (
    <div className="ud">
      <div className="ud-hero" onClick={() => photos.length && setFull(true)}>
        {photos.length ? (
          <div className="ud-strip" onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / el.clientWidth)); }}>
            {photos.map((p, k) => <img key={k} src={p.url} alt={p.cap ?? unit.name} />)}
          </div>
        ) : <div className="ud-ph"><span className="ms">photo_camera</span><span>ยังไม่มีรูป</span></div>}
        <button className="ud-back" onClick={(e) => { e.stopPropagation(); onBack(); }} aria-label="กลับ"><span className="ms">arrow_back</span></button>
        {photos.length > 1 && <span className="ud-count num">{i + 1}/{photos.length}</span>}
      </div>

      <div className="ud-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
          <b style={{ fontSize: 24, fontWeight: 800 }}>{unit.name}</b>
          <span className="num" style={{ whiteSpace: 'nowrap' }}><b style={{ fontSize: 20 }}>{baht(Number(unit.price))}</b><small className="cap">/คืน</small></span>
        </div>
        {unit.summary && <div className="sub">{unit.summary}</div>}
        <div className="cap">
          {[people && `รับ ${unit.max_people} คน`, unit.bedrooms ? `${unit.bedrooms} ห้องนอน` : null,
            unit.max_pets ? `น้อง ${unit.max_pets} ตัว` : null, unit.max_pet_kg ? `ไม่เกิน ${unit.max_pet_kg} กก./ตัว` : null].filter(Boolean).join(' · ')}
        </div>

        {unit.amenities.length > 0 && <>
          <div className="grp">สิ่งอำนวยความสะดวก</div>
          <div className="ud-amen">{unit.amenities.map((a) => <span key={a}>{a}</span>)}</div>
        </>}

        {(biz.checkin_time || biz.checkout_time) && (
          <div className="ud-io">
            <div><small className="cap">{people ? 'เช็กอิน' : 'รับฝาก'}</small><b className="num">{biz.checkin_time?.slice(0, 5) ?? '-'}</b></div>
            <div><small className="cap">{people ? 'เช็กเอาต์' : 'รับกลับ'}</small><b className="num">{biz.checkout_time?.slice(0, 5) ?? '-'}</b></div>
          </div>
        )}

        <div className="grp">ราคาต่อคืน</div>
        <div className="bill">
          <div className="l"><span>{unit.weekend_price !== null ? 'อาทิตย์–พฤหัส' : 'ทุกคืน'}</span><span className="num">{baht(Number(unit.price))}</span></div>
          {unit.weekend_price !== null && <div className="l"><span>ศุกร์–เสาร์</span><span className="num">{baht(Number(unit.weekend_price))}</span></div>}
          {unit.pet_fee ? <div className="l"><span>พาน้องมาด้วย / ตัว / คืน</span><span className="num">+{baht(Number(unit.pet_fee))}</span></div> : null}
        </div>

        {unit.rules && <>
          <div className="grp">{people ? 'กฎบ้าน' : 'ข้อควรรู้'}</div>
          <div className="list">{unit.rules.split(/\s*[·\n]\s*/).filter(Boolean).map((r) => <div key={r} className="li"><span className="ms">check</span><span className="t">{r}</span></div>)}</div>
        </>}

        <div className="grp">มัดจำและยกเลิก</div>
        <div className="note"><b>{DEP(biz)}</b>{biz.balance_days ? ` · ส่วนที่เหลือจ่ายก่อนเข้า ${biz.balance_days} วัน` : ''}<br />{biz.cancel_policy}</div>
        {biz.need_vaccine && <div className="note y">น้องต้องมีวัคซีนที่ยังไม่หมดอายุ และนำสมุดวัคซีนมาวันเข้าพัก</div>}
      </div>

      {action && (
        <div className="ud-foot">
          <span className="t">{action.sub && <small>{action.sub}</small>}{action.price && <b className="num" style={{ fontSize: 22 }}>{action.price}</b>}</span>
          <button className="btn" onClick={action.onClick}>{action.label}</button>
        </div>
      )}

      {full && (
        <div className="ud-full" onClick={() => setFull(false)}>
          <button className="ud-back" aria-label="ปิด"><span className="ms">close</span></button>
          <div className="ud-fullstrip">{photos.map((p, k) => <figure key={k}><img src={p.url} alt="" />{p.cap && <figcaption>{p.cap}</figcaption>}</figure>)}</div>
        </div>
      )}
    </div>
  );
}
