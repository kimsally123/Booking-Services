// การ์ด LINE (Flex Message) · หัวสีตามสถานะ · กล่องรายการแยกสีธุรกิจ · QR ในกรอบ · ปุ่มหลัก + ปุ่มรอง
import { bizLook } from './look';

export type CardItem = { business: string; color: string | null; type: string; biz: string; title: string; when: string };
export type Card = {
  head: string; headColor?: string; title: string; body?: string; items?: CardItem[]; rows?: [string, string][];
  image?: string; button?: { label: string; url: string }; button2?: { label: string; url?: string; text?: string };
  status?: string;          // ป้ายสถานะบนหัวการ์ด เช่น "รอโอน" "กำลังตรวจสลิป" "ยืนยันแล้ว"
  total?: [string, string]; // แถวสรุปตัวหนา เช่น ['โอนตอนนี้', '฿4,500']
  steps?: { labels: string[]; at: number };   // แถบขั้นตอน เช่น จองแล้ว › ตรวจสลิป › ยืนยัน
};

const txt = (text: string, o: Record<string, unknown> = {}) => ({ type: 'text', text: text || ' ', wrap: true, ...o });
const box = (layout: string, contents: unknown[], o: Record<string, unknown> = {}) => ({ type: 'box', layout, contents, ...o });

export function flexCard(c: Card) {
  const head = c.headColor ?? '#111111';
  const items = (c.items ?? []).slice(0, 6).map((i) => {
    const L = bizLook(i.business, i.color, i.type);
    const bar = L.border !== 'transparent' ? L.border : L.bg;
    return box('horizontal', [
      box('vertical', [], { width: '5px', cornerRadius: '3px', backgroundColor: bar }),
      box('vertical', [
        txt(i.biz, { size: 'xxs', color: '#8A8A85' }),
        txt(i.title, { size: 'sm', weight: 'bold', color: '#111111', margin: 'xs' }),
        txt(i.when, { size: 'xs', color: '#555555', margin: 'xs' }),
      ], { flex: 1, paddingStart: '10px' }),
    ], { backgroundColor: '#F6F6F3', cornerRadius: '12px', paddingAll: '12px', margin: 'sm' });
  });
  const rows = (c.rows ?? []).map(([l, v]) => box('horizontal', [
    txt(l, { size: 'sm', color: '#6B6B66', flex: 5 }), txt(v, { size: 'sm', color: '#111111', align: 'end', flex: 4 }),
  ], { margin: 'sm' }));
  const total = c.total ? box('horizontal', [
    txt(c.total[0], { size: 'md', weight: 'bold', color: '#111111', flex: 5 }),
    txt(c.total[1], { size: 'xl', weight: 'bold', color: head, align: 'end', flex: 5 }),
  ], { margin: 'md', alignItems: 'center' }) : null;
  const qr = c.image ? [
    box('vertical', [
      { type: 'image', url: c.image, size: 'full', aspectRatio: '1:1', aspectMode: 'fit' },
      txt('พร้อมเพย์ · กดค้างที่รูปเพื่อบันทึก แล้วสแกนในแอปธนาคาร', { size: 'xxs', color: '#8A8A85', align: 'center', margin: 'sm' }),
    ], { borderWidth: '1px', borderColor: '#E4E4E0', cornerRadius: '14px', paddingAll: '12px', margin: 'lg' }),
  ] : [];
  const btns = [
    ...(c.button ? [{ type: 'button', style: 'primary', color: head === '#111111' ? '#111111' : head, height: 'sm',
      action: { type: 'uri', label: c.button.label.slice(0, 20), uri: c.button.url } }] : []),
    ...(c.button2 ? [{ type: 'button', style: 'link', height: 'sm', color: '#555555',
      action: c.button2.url ? { type: 'uri', label: c.button2.label.slice(0, 20), uri: c.button2.url }
                             : { type: 'message', label: c.button2.label.slice(0, 20), text: (c.button2.text ?? c.button2.label).slice(0, 300) } }] : []),
  ];
  return {
    type: 'bubble', size: 'mega',
    header: box('vertical', [
      box('horizontal', [
        txt(c.head, { size: 'xs', color: '#FFFFFFCC', weight: 'bold', flex: 1, wrap: false }),
        ...(c.status ? [box('vertical', [txt(c.status, { size: 'xxs', color: head, weight: 'bold', wrap: false })],
          { backgroundColor: '#FFFFFF', cornerRadius: '999px', paddingStart: '10px', paddingEnd: '10px', paddingTop: '3px', paddingBottom: '3px', flex: 0 })] : []),
      ], { alignItems: 'center' }),
      txt(c.title, { size: 'xl', weight: 'bold', color: '#FFFFFF', margin: 'md' }),
      ...(c.body ? [txt(c.body, { size: 'sm', color: '#FFFFFFE6', margin: 'sm' })] : []),
    ], { backgroundColor: head, paddingAll: '18px' }),
    body: box('vertical', [
      ...(c.steps ? [box('horizontal', c.steps.labels.map((l, k) => box('vertical', [
        box('vertical', [], { height: '6px', cornerRadius: '3px', backgroundColor: k <= c.steps!.at ? head : '#E4E4E0' }),
        txt(l, { size: 'xxs', color: k === c.steps!.at ? '#111111' : '#8A8A85', weight: k === c.steps!.at ? 'bold' : 'regular', margin: 'sm', align: 'center' }),
      ], { flex: 1 })), { spacing: 'sm', margin: 'sm' })] : []),
      ...(items.length || rows.length || total || qr.length ? [] : [txt(' ', { size: 'xxs' })]),
      ...items,
      ...(rows.length || total ? [{ type: 'separator', margin: 'lg', color: '#E4E4E0' }, ...rows, ...(total ? [total] : [])] : []),
      ...qr,
    ], { paddingAll: '16px', paddingTop: items.length ? '14px' : '4px' }),
    ...(btns.length ? { footer: box('vertical', btns, { paddingAll: '12px', spacing: 'sm' }) } : {}),
    styles: { footer: { separator: true } },
  };
}
