// สีและไอคอนของแต่ละธุรกิจ (สีมาจาก businesses.color) · หน้าตาตามโปรโตไทป์
function hex(c: string) { return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); }
function lumOf(c: string) { const [r, g, b] = hex(c).map((x) => x / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
// สีอ่อนมาก (เช่น #FDF5DC) → ขอบสีเข้มโทนเดียวกัน (hue เดิม · s 72% · l 55%)
function edge(c: string) {
  const [r, g, b] = hex(c).map((x) => x / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const s = 0.72, l = 0.55, C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - C / 2;
  const [R, G, B] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
  return '#' + [R, G, B].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

export function bizLook(code: string, color: string | null, type: string) {
  const bg = color || '#111111';
  const lum = lumOf(bg);
  const icon = { pet_hotel: 'bed', villa: 'cottage', pool: 'pool', grooming: 'content_cut' }[code]
    || { stay: 'bed', session: 'event', slot: 'schedule' }[type] || 'event';
  const pale = lum > 0.9;
  return { bg, fg: lum > 0.55 ? '#111' : '#fff', icon, border: pale ? edge(bg) : 'transparent', shadow: pale ? `inset 0 0 0 1.5px ${edge(bg)}` : 'none' };
}

// path รูปใน bucket photos หรือ URL เต็ม
export function photoUrl(file: string | null | undefined): string | null {
  if (!file) return null;
  if (/^https?:\/\//.test(file)) return file;
  if (file.startsWith('/')) return file;   // ภาพในเว็บเอง เช่น /demo/xxx.jpg
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/photos/${encodeURIComponent(file)}` : `/api/photo?p=${encodeURIComponent(file)}`;
}
