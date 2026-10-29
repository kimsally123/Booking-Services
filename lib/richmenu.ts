import 'server-only';
import { appUrl, liffId } from './config';

// ริชเมนู 4 หน้า (สระ · Grooming · Pet hotel · Villa) สลับกันด้วยแถบบน (richmenuswitch + alias)
// ภาพ 2500×1686 อยู่ที่ public/richmenu/<biz>.jpg
// ผัง: แถบบน 4 ช่อง (สูง 270) · ซ้าย = จองเลย · ขวา 2×2 = ราคา · กฎ · การจองของฉัน · ติดต่อเจ้าหน้าที่
export const RM_TABS = ['pool', 'grooming', 'pet_hotel', 'villa'] as const;
const NAME = 'BaanMax · ';
const alias = (biz: string) => `baanmax-${biz.replace('_', '-')}`;
const API = () => process.env.LINE_API_BASE || 'https://api.line.me';
const DATA = () => process.env.LINE_API_DATA_BASE || 'https://api-data.line.me';

async function call(method: string, path: string, body?: unknown, base = API()) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN ใน Vercel');
  const r = await fetch(base + path, {
    method, headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': body instanceof ArrayBuffer ? 'image/jpeg' : 'application/json' }) },
    body: body === undefined ? undefined : body instanceof ArrayBuffer ? body : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`LINE ${method} ${path.split('/').slice(0, 5).join('/')} → ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

function menu(biz: string, link: (p: string) => string) {
  const area = (x: number, y: number, width: number, height: number, action: object) => ({ bounds: { x, y, width, height }, action });
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: NAME + biz,
    chatBarText: 'เมนูจอง',
    areas: [
      ...RM_TABS.map((t, i) => area(i * 625, 0, 625, 270, { type: 'richmenuswitch', richMenuAliasId: alias(t), data: `tab=${t}` })),
      area(0, 270, 1250, 1416, { type: 'uri', label: 'จองเลย', uri: link(`/b/${biz}`) }),
      area(1250, 270, 625, 714, { type: 'uri', label: 'ราคา', uri: link(`/b/${biz}/info?tab=price`) }),
      area(1875, 270, 625, 714, { type: 'uri', label: 'กฎ', uri: link(`/b/${biz}/info?tab=rules`) }),
      area(1250, 984, 625, 702, { type: 'uri', label: 'การจองของฉัน', uri: link('/me') }),
      area(1875, 984, 625, 702, { type: 'message', label: 'ติดต่อเจ้าหน้าที่', text: 'ติดต่อเจ้าหน้าที่' }),
    ],
  };
}

// ติดตั้งใหม่ทั้งชุด (กดซ้ำได้: ลบชุดเดิมของระบบนี้ก่อน)
export async function installRichMenus(first: string = 'pool'): Promise<{ menus: Record<string, string>; default: string }> {
  const id = await liffId();
  if (!id) throw new Error('ยังไม่ได้ตั้ง LIFF ID');
  const base = appUrl();
  if (!base) throw new Error('ไม่รู้โดเมนของเว็บ (ตั้ง APP_URL)');
  const link = (p: string) => `https://liff.line.me/${id}${p}`;

  // ตรวจทุกเมนูก่อนสร้าง (ผิดตรงไหนรู้ก่อน ไม่ค้างครึ่งชุด)
  for (const b of RM_TABS) await call('POST', '/v2/bot/richmenu/validate', menu(b, link));
  const imgs: Record<string, ArrayBuffer> = {};
  for (const b of RM_TABS) {
    const r = await fetch(`${base}/richmenu/${b}.jpg`);
    if (!r.ok) throw new Error(`โหลดภาพริชเมนู ${b} ไม่ได้ (${r.status})`);
    imgs[b] = await r.arrayBuffer();
  }

  // ลบชุดเดิม
  const old = (await call('GET', '/v2/bot/richmenu/list')).richmenus as { richMenuId: string; name: string }[];
  const aliases = (await call('GET', '/v2/bot/richmenu/alias/list')).aliases as { richMenuAliasId: string }[];
  for (const a of aliases) if (a.richMenuAliasId.startsWith('baanmax-')) await call('DELETE', `/v2/bot/richmenu/alias/${a.richMenuAliasId}`);
  for (const m of old) if (m.name.startsWith(NAME)) await call('DELETE', `/v2/bot/richmenu/${m.richMenuId}`);

  const menus: Record<string, string> = {};
  for (const b of RM_TABS) {
    const { richMenuId } = await call('POST', '/v2/bot/richmenu', menu(b, link));
    await call('POST', `/v2/bot/richmenu/${richMenuId}/content`, imgs[b], DATA());
    await call('POST', '/v2/bot/richmenu/alias', { richMenuAliasId: alias(b), richMenuId });
    menus[b] = richMenuId;
  }
  const def = (RM_TABS as readonly string[]).includes(first) ? first : 'pool';
  await call('POST', `/v2/bot/user/all/richmenu/${menus[def]}`);
  return { menus, default: def };
}

// สถานะ: มีชุดของระบบนี้อยู่ไหม และอันไหนเป็นค่าเริ่ม
export async function richMenuStatus(): Promise<{ installed: string[]; default: string | null }> {
  const list = (await call('GET', '/v2/bot/richmenu/list')).richmenus as { richMenuId: string; name: string }[];
  const mine = list.filter((m) => m.name.startsWith(NAME));
  let def: string | null = null;
  try { def = (await call('GET', '/v2/bot/user/all/richmenu')).richMenuId ?? null; } catch { def = null; }
  const d = mine.find((m) => m.richMenuId === def);
  return { installed: mine.map((m) => m.name.slice(NAME.length)), default: d ? d.name.slice(NAME.length) : null };
}
