import 'server-only';
import { sql } from './db';
import type { BizCatalog, Business, Catalog, Pet } from './types';

// อ่านข้อมูลร้าน (ข้อมูลเดียวกับที่หน้าเว็บ anon อ่านได้)

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const [r] = await sql`select value from settings where key = ${key}`;
  return r?.value ?? fallback;
}

export async function getCatalog(): Promise<Catalog> {
  const businesses = await sql<Business[]>`
    select code, name, tagline, booking_type, color, id_prefix, deposit_type, deposit_value,
           checkin_time, checkout_time, cancel_policy, need_vaccine, sort
    from businesses where active order by sort, code`;
  return { shop_name: await getSetting('shop_name', 'ร้าน'), businesses: [...businesses] };
}

export async function getBizCatalog(code: string): Promise<BizCatalog | null> {
  const [business] = await sql<Business[]>`
    select code, name, tagline, booking_type, color, id_prefix, deposit_type, deposit_value,
           checkin_time, checkout_time, cancel_policy, need_vaccine, sort
    from businesses where code = ${code} and active`;
  if (!business) return null;

  const [units, services, sessions, tiers, cross_sells, closures, shop_name, hold] = await Promise.all([
    sql`select u.code, u.business_code, u.name, u.summary, u.price, u.weekend_price, u.max_people, u.bedrooms,
               u.max_pets, u.max_pet_kg, u.pet_fee, u.amenities, u.rules,
               coalesce((select json_agg(json_build_object('file', p.file, 'caption', p.caption, 'is_cover', p.is_cover)
                                  order by p.is_cover desc, p.sort)
                         from unit_photos p where p.unit_code = u.code), '[]') as photos
        from units u where u.business_code = ${code} and u.active order by u.sort, u.code`,
    sql`select s.code, s.business_code, s.name, s.kind, s.description, s.price_mode, s.price, s.duration_min,
               coalesce((select json_agg(json_build_object('tier_code', sp.tier_code, 'price', sp.price, 'duration_min', sp.duration_min)
                                  order by t.min_kg)
                         from service_prices sp join weight_tiers t on t.code = sp.tier_code
                         where sp.service_code = s.code), '[]') as prices
        from services s where s.business_code = ${code} and s.active order by s.kind, s.sort, s.code`,
    sql`select ps.code, ps.unit_code, ps.weekdays, to_char(ps.start_time, 'HH24:MI') as start_time,
               to_char(ps.end_time, 'HH24:MI') as end_time, ps.size_rule, ps.capacity, ps.price
        from pool_sessions ps join units u on u.code = ps.unit_code
        where u.business_code = ${code} and ps.active and u.active order by ps.start_time`,
    sql`select code, label, min_kg, max_kg from weight_tiers order by min_kg`,
    sql`select x.from_business, x.offer_business, x.offer_item, x.title, x.when_rule, x.condition,
               b.name as offer_name, b.color as offer_color, b.booking_type as offer_type
        from cross_sells x join businesses b on b.code = x.offer_business and b.active
        where x.from_business = ${code} and x.active order by x.sort`,
    sql`select unit_code, session_code, to_char(date_from, 'YYYY-MM-DD') as date_from,
               to_char(date_to, 'YYYY-MM-DD') as date_to, reason
        from closures where business_code = ${code} and date_to >= current_date`,
    getSetting('shop_name', 'ร้าน'),
    getSetting('hold_minutes', '30'),
  ]);

  return {
    shop_name,
    hold_minutes: Number(hold) || 30,
    business,
    units: units as never,
    services: services as never,
    sessions: sessions as never,
    tiers: tiers as never,
    cross_sells: cross_sells as never,
    closures: closures as never,
  };
}

// น้องของลูกค้า + สถานะวัคซีน
export async function getPets(customerCode: string): Promise<Pet[]> {
  const rows = await sql<Pet[]>`
    select p.code, p.name, p.species, p.breed, p.weight_kg, p.note, tier_for(p.weight_kg) as tier_code,
           (select to_char(max(v.expires_on), 'YYYY-MM-DD') from pet_vaccines v
             where v.pet_code = p.code and v.status = 'approved') as vaccine_until,
           exists (select 1 from pet_vaccines v where v.pet_code = p.code and v.status = 'pending') as vaccine_pending
    from pets p where p.customer_code = ${customerCode} order by p.created_at, p.code`;
  return [...rows];
}
