// QR พร้อมเพย์ตามมาตรฐาน EMVCo (Thai QR) พร้อมยอดเงิน
// id = เบอร์มือถือ 10 หลัก · เลขประจำตัวผู้เสียภาษี/บัตร 13 หลัก · e-Wallet 15 หลัก

const tlv = (id: string, v: string) => id + String(v.length).padStart(2, '0') + v;

export function crc16(s: string): string {
  let crc = 0xffff;
  for (const ch of Buffer.from(s, 'utf8')) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function promptPayPayload(id: string, amount: number): string {
  const d = id.replace(/\D/g, '');
  let acc: string;
  if (d.length === 10 && d.startsWith('0')) acc = tlv('01', '0066' + d.slice(1));
  else if (d.length === 13) acc = tlv('02', d);
  else if (d.length === 15) acc = tlv('03', d);
  else throw new Error('เลขพร้อมเพย์ไม่ถูกต้อง');
  const body =
    tlv('00', '01') +
    tlv('01', amount > 0 ? '12' : '11') +
    tlv('29', tlv('00', 'A000000677010111') + acc) +
    tlv('58', 'TH') +
    tlv('53', '764') +
    (amount > 0 ? tlv('54', amount.toFixed(2)) : '') +
    '6304';
  return body + crc16(body);
}
