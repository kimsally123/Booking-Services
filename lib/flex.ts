// การ์ด LINE (Flex Message) ตามโทนโปรโตไทป์: ป้ายธุรกิจ · หัวข้อ · รายการ · ปุ่มเปิดหน้าจอง
import { bizLook } from './look';

export type CardItem = { business: string; color: string | null; type: string; biz: string; title: string; when: string };
export type Card = { head: string; headColor?: string; title: string; body?: string; items?: CardItem[]; rows?: [string, string][]; image?: string; button?: { label: string; url: string } };

const txt = (text: string, o: Record<string, unknown> = {}) => ({ type: 'text', text: text || ' ', wrap: true, ...o });

export function flexCard(c: Card) {
  const items = (c.items ?? []).slice(0, 6).map((i) => {
    const L = bizLook(i.business, i.color, i.type);
    return {
      type: 'box', layout: 'horizontal', spacing: 'md', margin: 'md', contents: [
        { type: 'box', layout: 'vertical', width: '6px', cornerRadius: '3px', backgroundColor: L.border !== 'transparent' ? L.border : L.bg, contents: [] },
        { type: 'box', layout: 'vertical', flex: 1, contents: [
          txt(i.biz, { size: 'xs', color: '#555555' }),
          txt(i.title, { size: 'sm', weight: 'bold', color: '#111111' }),
          txt(i.when, { size: 'xs', color: '#555555' }),
        ] },
      ],
    };
  });
  const rows = (c.rows ?? []).map(([l, v]) => ({
    type: 'box', layout: 'horizontal', margin: 'sm', contents: [txt(l, { size: 'sm', color: '#555555', flex: 3 }), txt(v, { size: 'sm', weight: 'bold', align: 'end', flex: 4 })],
  }));
  return {
    type: 'bubble', size: 'kilo',
    header: { type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: c.headColor ?? '#111111', contents: [txt(c.head, { size: 'xs', color: '#FFFFFF', weight: 'bold' })] },
    body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: [
      txt(c.title, { size: 'lg', weight: 'bold', color: '#111111' }),
      ...(c.body ? [txt(c.body, { size: 'sm', color: '#555555', margin: 'sm' })] : []),
      ...(items.length ? [{ type: 'separator', margin: 'lg' }, ...items] : []),
      ...(rows.length ? [{ type: 'separator', margin: 'lg' }, ...rows] : []),
      ...(c.image ? [{ type: 'image', url: c.image, size: 'full', aspectRatio: '1:1', aspectMode: 'fit', margin: 'lg' },
                     txt('กดค้างที่รูปเพื่อบันทึก แล้วสแกนในแอปธนาคาร', { size: 'xxs', color: '#888888', align: 'center', margin: 'sm' })] : []),
    ] },
    ...(c.button ? { footer: { type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
      { type: 'button', style: 'primary', color: '#111111', height: 'sm', action: { type: 'uri', label: c.button.label.slice(0, 20), uri: c.button.url } },
    ] } } : {}),
  };
}
