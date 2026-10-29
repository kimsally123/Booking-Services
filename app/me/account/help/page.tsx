import { getSetting } from '@/lib/catalog';
import { oaId } from '@/lib/line';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import { Back } from '@/components/cust/AccountForms';

export const dynamic = 'force-dynamic';
export default async function Help() {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const [shop, oa, phone, addr, map] = await Promise.all([getSetting('shop_name', 'ร้าน'), oaId(), getSetting('shop_phone'), getSetting('shop_address'), getSetting('shop_map_url')]);
  return (
    <CustScreen>
      <div className="head"><Back /><b style={{ fontSize: 20, fontWeight: 800 }}>ติดต่อเจ้าหน้าที่</b></div>
      <div className="note">พิมพ์ในแชท LINE ของ {shop} ได้เลย เจ้าหน้าที่ตอบในเวลาทำการ</div>
      {oa && <a className="btnw dark" href={`https://line.me/R/oaMessage/${encodeURIComponent(oa)}/`}><span className="ms">chat</span>แชทกับร้าน</a>}
      {phone && <a className="btnw line" href={`tel:${phone}`}><span className="ms">call</span>โทร {phone} · กรณีฉุกเฉิน</a>}
      {addr && <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
        <span className="t"><b><span className="ms" style={{ fontSize: 18, verticalAlign: -3 }}>location_on</span> ที่อยู่ร้าน</b><small style={{ whiteSpace: 'pre-line' }}>{addr}</small></span>
        {map && map.startsWith('https://') && <a className="btnw line" href={map} target="_blank" rel="noreferrer">เปิดแผนที่</a>}
      </div>}
    </CustScreen>
  );
}
