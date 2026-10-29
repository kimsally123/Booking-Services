// ชนิดข้อมูลที่ส่งระหว่าง server ↔ หน้าจอ (ชื่อตรงคอลัมน์ในฐานข้อมูล)

export type BookingType = 'stay' | 'session' | 'slot';

export interface Business {
  code: string;
  name: string;
  tagline: string;
  booking_type: BookingType;
  color: string | null;
  id_prefix: string;
  deposit_type: 'full' | 'percent' | 'fixed' | 'first_night';
  balance_days?: number | null;
  deposit_value: number | null;
  checkin_time: string | null;
  checkout_time: string | null;
  cancel_policy: string;
  need_vaccine: boolean;
  sort: number;
}

export interface Photo { file: string; caption: string | null; is_cover: boolean }

export interface Unit {
  code: string;
  business_code: string;
  name: string;
  summary: string | null;
  price: number;
  weekend_price: number | null;
  max_people: number | null;
  bedrooms: number | null;
  max_pets: number | null;
  max_pet_kg: number | null;
  pet_fee: number | null;
  amenities: string[];
  rules: string | null;
  photos: Photo[];
}

export interface Service {
  code: string;
  business_code: string;
  name: string;
  kind: 'main' | 'addon';
  description: string | null;
  price_mode: 'flat' | 'by_weight';
  price: number | null;
  duration_min: number | null;
  prices: { tier_code: string; price: number; duration_min: number }[];
  photos?: Photo[];
}

export interface Tier { code: string; label: string; min_kg: number; max_kg: number | null }

export interface Session {
  code: string;
  unit_code: string;
  weekdays: number[];
  start_time: string;
  end_time: string;
  size_rule: 'small' | 'large' | 'all';
  capacity: number;
  price: number;
}

export interface CrossSell {
  from_business: string;
  offer_business: string;
  offer_item: string | null;
  title: string;
  when_rule: 'checkout_day' | 'during_stay' | 'same_day';
  condition: string | null;
  offer_name: string;
  offer_color: string | null;
  offer_type: BookingType;
}

export interface Pet {
  code: string;
  name: string;
  species: 'dog' | 'cat';
  breed: string | null;
  weight_kg: number;
  note: string | null;
  tier_code: string | null;
  vaccine_until: string | null; // วันหมดอายุวัคซีนที่ผ่านตรวจล่าสุด
  vaccine_pending: boolean;
  photo?: string | null;
}

export interface Catalog {
  shop_name: string;
  businesses: Business[];
}

export interface BizCatalog {
  shop_name: string;
  hold_minutes: number;
  business: Business;
  units: Unit[];
  services: Service[];
  sessions: Session[];
  tiers: Tier[];
  cross_sells: CrossSell[];
  closures: { unit_code: string | null; session_code: string | null; date_from: string; date_to: string; reason: string | null }[];
}

// รายการที่ลูกค้าเลือก (ส่งไปคิดราคา / สร้างการจอง)
export type CartItem =
  | { business: string; kind: 'stay'; unit: string; from: string; to: string; pets: string[]; guests?: number }
  | { business: string; kind: 'session'; session: string; date: string; pets: string[] }
  | { business: string; kind: 'slot'; service: string; addons: string[]; staff: string; start: string; pet: string };

export interface QuoteLine { label: string; amount: number; note?: string }
export interface QuoteItem {
  business: string;
  title: string;
  when: string;
  lines: QuoteLine[];
  price: number;
  deposit: number;
  balance: number;           // ส่วนที่ต้องจ่ายออนไลน์ก่อน balance_by (Villa) · ที่เหลือจ่ายที่ร้าน
  balance_by: string | null;
  start_at: string; // timestamptz (+07)
  end_at: string;
}
export interface Quote { items: QuoteItem[]; total: number; due_now: number; balance: number; balance_by: string | null; pay_later: number; credit_used?: number }

export interface OrderView {
  code: string; status: 'holding' | 'pending_review' | 'paid' | 'cancelled' | 'expired';
  total: number; due_now: number; paid_amount: number; hold_until: string | null; late: boolean;
  refund_status: string | null; refund_amount: number; balance_due: number; balance_due_by: string | null; change_request: string | null;
  last_payment: { status: string; reason: string | null } | null;
  items: { code: string; business_code: string; biz: string; status: string; price: number; s: string; e: string; item: string; pets: string }[];
}
