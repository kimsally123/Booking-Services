import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { sql } from './db';

// ตรวจสลิปเบื้องต้น (คัดกรอง ไม่ใช่พิสูจน์ว่าเงินเข้า)
// 1) QR ในสลิป (ธนาคารไทยใส่ทุกใบ) → เลขอ้างอิงรายการ ใช้กันสลิปซ้ำ · ไม่ต้องใช้ OCR
// 2) Google Vision อ่านข้อความ (ถ้าตั้ง GOOGLE_VISION_API_KEY · จำกัดต่อเดือนตาม ocr_month_limit) → ยอด · ผู้รับ · วันที่
// ผล: not_slip (ไม่รับ) · duplicate (ไม่รับ) · review (ส่งพนักงานตรวจ พร้อมจุดที่ต้องดู)

export type SlipResult = {
  verdict: 'not_slip' | 'duplicate' | 'review';
  ref: string | null;
  hash: string;
  amount: number | null;
  ocr: 'vision' | 'off' | 'nokey' | 'quota' | 'error';
  flags: string[];          // จุดที่พนักงานต้องดู (ภาษาคน)
  dupOf?: { order: string; status: string; kind: string | null };   // สลิปซ้ำกับใบไหน
  ok: string[];             // จุดที่ตรง
  message?: string;         // ข้อความถึงลูกค้าเมื่อไม่รับ
};

// ---------- QR ในสลิป ----------
// payload มาตรฐานตรวจสลิป: 00(ข้อมูล: 00 api · 01 ธนาคารผู้โอน · 02 เลขอ้างอิง) 51(TH) 91(CRC)
function tlv(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= s.length) {
    const id = s.slice(i, i + 2), n = Number(s.slice(i + 2, i + 4));
    if (!Number.isFinite(n) || i + 4 + n > s.length) break;
    out[id] = s.slice(i + 4, i + 4 + n);
    i += 4 + n;
  }
  return out;
}
export function slipRef(qr: string): string | null {
  const top = tlv(qr.trim());
  const ref = top['00'] ? tlv(top['00'])['02'] : undefined;
  if (ref && /^[A-Za-z0-9]{8,}$/.test(ref)) return ref;
  if (/^[A-Za-z0-9]{12,}$/.test(qr.trim())) return qr.trim();   // บางธนาคารใส่เลขอ้างอิงตรง ๆ
  return null;
}
// QR พร้อมเพย์สำหรับจ่าย (ไม่ใช่สลิป) ขึ้นต้น 000201
const isPayQr = (qr: string) => qr.startsWith('000201');

export async function readQr(buf: Buffer): Promise<string | null> {
  for (const w of [1400, 900, 2200]) {
    try {
      const { data, info } = await sharp(buf).rotate().resize({ width: w, withoutEnlargement: w > 1400 ? false : true })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const r = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, { inversionAttempts: 'attemptBoth' });
      if (r?.data) return r.data;
    } catch { /* รูปเสีย */ }
  }
  return null;
}

// ---------- OCR (Google Vision) ----------
const ym = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7).replace('-', '');
async function ocrText(buf: Buffer): Promise<{ text: string | null; ocr: SlipResult['ocr'] }> {
  const key = process.env.GOOGLE_VISION_API_KEY;
  const [sw] = await sql`select value from settings where key = 'ocr_enabled'`;
  if (sw?.value === 'off') return { text: null, ocr: 'off' };
  if (!key) return { text: null, ocr: 'nokey' };
  const k = `ocr_used_${ym()}`;
  const [lim] = await sql`select value from settings where key = 'ocr_month_limit'`;
  const limit = Number(lim?.value ?? 1000) || 0;
  // จองโควตาก่อนยิง (นับทุกครั้งที่เรียก Google)
  const [r] = await sql`
    insert into settings (key, value, note) values (${k}, '1', 'จำนวนรูปที่อ่านด้วย Google Vision เดือนนี้')
    on conflict (key) do update set value = (settings.value::int + 1)::text
      where settings.value::int < ${limit}
    returning value`;
  if (!r) return { text: null, ocr: 'quota' };
  try {
    const small = await sharp(buf).rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const res = await fetch(`${process.env.VISION_API_BASE || 'https://vision.googleapis.com'}/v1/images:annotate?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requests: [{ image: { content: small.toString('base64') }, features: [{ type: 'TEXT_DETECTION' }], imageContext: { languageHints: ['th', 'en'] } }] }),
      signal: AbortSignal.timeout(12000),
    });
    const j = await res.json();
    if (!res.ok || j.responses?.[0]?.error) return { text: null, ocr: 'error' };
    return { text: (j.responses?.[0]?.fullTextAnnotation?.text as string) ?? '', ocr: 'vision' };
  } catch {
    return { text: null, ocr: 'error' };
  }
}

// ---------- อ่านค่าจากข้อความ ----------
const MONEY = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)/g;
export function amountsIn(text: string): { value: number; near: boolean }[] {
  const out: { value: number; near: boolean }[] = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (/ค่าธรรมเนียม|fee/i.test(line)) return;
    const ctx = [lines[i - 1] ?? '', line].join(' ');
    for (const m of line.matchAll(MONEY)) {
      const v = Number(m[1].replace(/,/g, '') + '.' + m[2]);
      if (v > 0) out.push({ value: v, near: /จำนวน|ยอด|amount|บาท|thb|฿/i.test(ctx) });
    }
  });
  return out;
}
const TH_MON: Record<string, number> = { 'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12 };
const EN_MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// วันที่ในสลิป → YYYY-MM-DD (ปี พ.ศ. 2 หรือ 4 หลัก หรือ ค.ศ.)
export function slipDate(text: string): string | null {
  const t = text.replace(/\s+/g, ' ');
  let m = /(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{2,4})/.exec(t);
  let d: number, mo: number, y: number;
  if (m) { d = +m[1]; mo = TH_MON[m[2]]; y = +m[3]; }
  else {
    m = /(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{2,4})/i.exec(t);
    if (!m) return null;
    d = +m[1]; mo = EN_MON[m[2].toLowerCase()]; y = +m[3];
  }
  if (y < 100) y += y > 60 ? 2500 : 2000;     // 69 = 2569 · 26 = 2026
  if (y > 2400) y -= 543;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const digits = (s: string) => s.replace(/\D/g, '');

// ---------- รวม ----------
export async function checkSlip(buf: Buffer, o: { due: number; createdAt: Date; account: string; promptpay: string }): Promise<SlipResult> {
  const hash = createHash('sha256').update(buf).digest('hex');
  const flags: string[] = [], ok: string[] = [];
  const qr = await readQr(buf);
  if (qr && isPayQr(qr)) {
    return { verdict: 'not_slip', ref: null, hash, amount: null, ocr: 'off', flags, ok,
             message: 'รูปนี้เป็น QR สำหรับจ่ายเงิน ไม่ใช่สลิป · โอนแล้วแนบรูปสลิปจากแอปธนาคาร' };
  }
  const ref = qr ? slipRef(qr) : null;
  const slipQr = !!ref;                 // QR อื่น (เช่น QR แอดไลน์) ไม่นับว่าเป็น QR ของสลิป

  // กันซ้ำ: เลขอ้างอิงเดิม หรือไฟล์เดิม
  const [dup] = await sql`select order_code, status, reject_kind from payments where slip_hash = ${hash} or (${ref}::text is not null and slip_ref = ${ref})
                          order by created_at desc limit 1`;
  if (dup) {
    return { verdict: 'duplicate', ref, hash, amount: null, ocr: 'off', flags, ok, dupOf: { order: dup.order_code, status: dup.status, kind: dup.reject_kind ?? null },
             message: 'สลิปนี้เคยใช้แล้ว · แนบสลิปของการโอนครั้งนี้' };
  }

  const { text, ocr } = await ocrText(buf);
  let amount: number | null = null;
  if (text !== null) {
    const am = amountsIn(text);
    const exact = am.find((a) => Math.abs(a.value - o.due) < 0.005);
    amount = exact?.value ?? am.find((a) => a.near)?.value ?? null;
    const slipLike = slipQr || am.length > 0 || /โอน|สำเร็จ|transfer|successful|พร้อมเพย์|promptpay|ธนาคาร|bank/i.test(text);
    if (!slipLike) {
      return { verdict: 'not_slip', ref, hash, amount: null, ocr, flags, ok,
               message: 'ไม่พบข้อมูลการโอนในรูปนี้ · แนบรูปสลิปจากแอปธนาคาร ให้เห็นทั้งใบ' };
    }
    if (amount === null) flags.push('อ่านยอดในสลิปไม่ออก');
    else if (Math.abs(amount - o.due) >= 0.005) flags.push(`ยอดในสลิป ฿${amount.toLocaleString('en-US')} ไม่ตรงยอดที่ต้องจ่าย ฿${o.due.toLocaleString('en-US')}`);
    else ok.push('ยอดตรง');

    // ผู้รับ: ชื่อบัญชี (คำแรก) หรือเลขพร้อมเพย์ 4 ตัวท้าย
    const first = o.account.replace(/^(นาย|นาง(สาว)?|น\.ส\.|บจก\.|บริษัท)\s*/, '').split(/\s+/)[0] ?? '';
    const last4 = digits(o.promptpay).slice(-4);
    const flat = text.replace(/\s+/g, '');
    if ((first.length >= 2 && flat.includes(first)) || (last4.length === 4 && digits(text).includes(last4))) ok.push('ผู้รับตรง');
    else if (o.account || o.promptpay) flags.push('ไม่เห็นชื่อผู้รับ/เลขพร้อมเพย์ของร้านในสลิป');

    const d = slipDate(text);
    const made = new Date(o.createdAt.getTime() + 7 * 3600000).toISOString().slice(0, 10);
    if (d && d < made) flags.push(`วันที่ในสลิป (${d}) ก่อนวันที่จอง`);
  } else {
    flags.push(ocr === 'quota' ? 'เดือนนี้อ่านสลิปอัตโนมัติครบโควตาแล้ว · ตรวจยอดเอง'
      : ocr === 'error' ? 'อ่านข้อความในสลิปไม่สำเร็จ · ตรวจยอดเอง'
      : ocr === 'nokey' ? 'เปิดอ่านสลิปไว้แล้ว แต่ยังไม่ใส่ key Google Vision · ตรวจยอดเอง'
      : 'ปิดอ่านสลิปอัตโนมัติอยู่ · ตรวจยอดเอง');
    if (!slipQr) {
      // ไม่มีทั้ง QR ของสลิปและ OCR → บอกไม่ได้ว่าเป็นสลิป · ไม่รับไว้ก่อน ให้ถ่ายใหม่ทั้งใบ
      return { verdict: 'not_slip', ref, hash, amount: null, ocr, flags, ok,
               message: qr ? 'QR ในรูปนี้ไม่ใช่ QR ของสลิปโอนเงิน · แนบรูปสลิปจากแอปธนาคาร ให้เห็นทั้งใบ'
                           : 'ไม่พบ QR ของสลิปในรูปนี้ · แนบรูปสลิปจากแอปธนาคาร ให้เห็นทั้งใบและ QR มุมสลิป' };
    }
  }
  if (ref) ok.push('มีเลขอ้างอิงจาก QR ในสลิป ไม่ซ้ำ');
  else flags.push(qr ? 'QR ในรูปไม่ใช่ QR ของสลิป (กันสลิปซ้ำไม่ได้)' : 'ไม่พบ QR ในสลิป (กันสลิปซ้ำไม่ได้)');
  return { verdict: 'review', ref, hash, amount, ocr, flags, ok };
}
