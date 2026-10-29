-- น้องตัวเดียวอยู่ 2 ที่พร้อมกันไม่ได้ (ชนิดเดียวกัน: ห้องซ้อนห้อง · คิวช่างซ้อนคิว · รอบสระเดิมซ้ำ)
-- ต่างชนิดได้ เช่น ฝาก Pet hotel แล้วอาบน้ำ Grooming ระหว่างพัก
create or replace function pet_overlap(p_booking text) returns void
language plpgsql as $$
declare x record;
begin
  select k2.code, p.name into x
  from bookings k join booking_pets bp on bp.booking_code = k.code
  join booking_pets bp2 on bp2.pet_code = bp.pet_code and bp2.booking_code <> k.code
  join bookings k2 on k2.code = bp2.booking_code
  join pets p on p.code = bp.pet_code
  where k.code = p_booking and booking_active(k.status) and booking_active(k2.status) and k2.kind = k.kind
    and tstzrange(k.start_at, k.end_at, '[)') && tstzrange(k2.start_at, k2.end_at, '[)')
  limit 1;
  if found then raise exception 'pet_busy: % มีการจองช่วงเวลานี้แล้ว (%)', x.name, x.code; end if;
end $$;

create or replace function t_pet_overlap_bp() returns trigger language plpgsql as $$
begin perform pet_overlap(new.booking_code); return new; end $$;
create trigger t_pet_overlap after insert on booking_pets for each row execute function t_pet_overlap_bp();

create or replace function t_pet_overlap_bk() returns trigger language plpgsql as $$
begin
  if booking_active(new.status) and (not booking_active(old.status) or new.start_at <> old.start_at or new.end_at <> old.end_at) then
    perform pet_overlap(new.code);
  end if;
  return new;
end $$;
create trigger t_pet_overlap_upd after update of status, start_at, end_at on bookings for each row execute function t_pet_overlap_bk();

-- โควตาคิวต่อช่างต่อวัน กันในฐานข้อมูล (ยิงจองพร้อมกันก็เกินไม่ได้)
create or replace function groom_quota() returns trigger language plpgsql as $$
declare d date; n int; q int;
begin
  if new.kind <> 'slot' or new.staff_code is null or not booking_active(new.status) then return new; end if;
  if tg_op = 'UPDATE' and booking_active(old.status) and old.staff_code = new.staff_code
     and (old.start_at at time zone 'Asia/Bangkok')::date = (new.start_at at time zone 'Asia/Bangkok')::date then return new; end if;
  d := (new.start_at at time zone 'Asia/Bangkok')::date;
  perform pg_advisory_xact_lock(hashtext('quota|' || new.staff_code || '|' || d::text));
  select daily_quota into q from staff where code = new.staff_code;
  select count(*) into n from bookings
   where staff_code = new.staff_code and kind = 'slot' and booking_active(status) and code <> new.code
     and (start_at at time zone 'Asia/Bangkok')::date = d;
  if n >= coalesce(q, 999) then raise exception 'quota_full: ช่างรับคิวครบแล้ววันนี้'; end if;
  return new;
end $$;
create trigger t_groom_quota before insert or update of staff_code, start_at, status on bookings
  for each row execute function groom_quota();
