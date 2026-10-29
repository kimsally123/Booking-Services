-- ทดสอบกติกาฐานข้อมูล · รันหลัง migration + seed
-- psql ... -f tests/db_test.sql   (ทุกอย่าง rollback ท้ายไฟล์ ข้อมูลไม่เปลี่ยน)
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
begin;

create function pg_temp.ok(name text, cond boolean) returns void language plpgsql as $$
begin raise notice '% %', case when cond then 'PASS' else 'FAIL' end, name;
  if not cond then raise exception 'test failed: %', name; end if; end $$;

-- คาดว่าต้องพัง และข้อความ error มีคำที่ระบุ
create function pg_temp.fails(name text, stmt text, expect text) returns void language plpgsql as $$
declare m text;
begin
  begin execute stmt; exception when others then m := sqlerrm; end;
  perform pg_temp.ok(name || ' (' || coalesce(m, 'ไม่พัง') || ')', m is not null and m ~* expect);
end $$;

-- ข้อมูลทดสอบ: ลูกค้า 1 คน น้องเล็ก 9 ตัว (มีวัคซีน) + น้องใหญ่ 1 + น้องไม่มีวัคซีน 1
insert into customers (code, display_name) values ('CT', 'ทดสอบ');
insert into pets (code, customer_code, name, species, weight_kg)
  select 'PT' || i, 'CT', 'น้อง' || i, 'dog', 4 from generate_series(1, 9) i;
insert into pets values ('PBIG', 'CT', 'บิ๊ก', 'dog', null, 15), ('PNOVAC', 'CT', 'ยังไม่ฉีด', 'dog', null, 4);
update pets set created_at = now() where code in ('PBIG', 'PNOVAC');
insert into pet_vaccines (pet_code, vaccine, expires_on, status)
  select code, 'รวม 5 โรค', '2027-12-31', 'approved' from pets where customer_code = 'CT' and code <> 'PNOVAC';
insert into orders (code, customer_code, total, due_now, hold_until) values ('OT1', 'CT', 0, 0, now() + interval '30 min');

-- 1 ห้องเดียวกัน ช่วงทับกัน → จองไม่ได้
select pg_temp.fails('ห้องทับช่วง',
  $q$insert into bookings (code, order_code, business_code, unit_code, start_at, end_at, price)
     values ('X1','OT1','pet_hotel','COZY1','2026-11-21 18:00+07','2026-11-22 12:00+07',650)$q$, 'no_double_stay');

-- 2 ห้องเดียวกัน ต่อคิวพอดี (ออก 12:00 เข้า 12:00) → ได้
insert into bookings (code, order_code, business_code, unit_code, start_at, end_at, price)
  values ('X2','OT1','pet_hotel','COZY1','2026-11-22 12:00+07','2026-11-23 12:00+07',650);
select pg_temp.ok('ห้องต่อคิวพอดี', true);

-- 3 ช่างคนเดิม คิวทับ → ไม่ได้ · ช่างอีกคน → ได้
select pg_temp.fails('ช่างคิวทับ',
  $q$insert into bookings (code, order_code, business_code, service_code, staff_code, start_at, end_at, price)
     values ('X3','OT1','grooming','G-BATH','ST02','2026-11-21 15:00+07','2026-11-21 16:00+07',350)$q$, 'no_double_slot');
insert into bookings (code, order_code, business_code, service_code, staff_code, start_at, end_at, price)
  values ('X4','OT1','grooming','G-BATH','ST03','2026-11-21 15:00+07','2026-11-21 16:00+07',350);
select pg_temp.ok('ช่างอีกคนว่าง', true);

-- 4 บริการเสริมต้องเป็น addon ของ Grooming
select pg_temp.fails('บริการเสริมผิด',
  $q$insert into bookings (code, order_code, business_code, service_code, addon_codes, staff_code, start_at, end_at, price)
     values ('X5','OT1','grooming','G-BATH','{G-CUT}','ST03','2026-11-21 17:00+07','2026-11-21 18:00+07',350)$q$, 'addon_invalid');

-- 5 รอบสระ: S1000 รับ 10 · ใน seed จองไปแล้ว 2
select pg_temp.ok('ที่ว่างเริ่มต้น = 8', session_left('S1000', '2026-11-21 10:00+07') = 8);
insert into bookings (code, order_code, business_code, session_code, start_at, end_at, price)
  values ('X6','OT1','pool','S1000','2026-11-21 10:00+07','2026-11-21 11:00+07',1920);
select pg_temp.ok('เติม unit_code ของสระเอง', (select unit_code from bookings where code = 'X6') = 'POOL1');
insert into booking_pets select 'X6', 'PT' || i from generate_series(1, 8) i;
select pg_temp.ok('รอบเต็มพอดี', session_left('S1000', '2026-11-21 10:00+07') = 0);
insert into bookings (code, order_code, business_code, session_code, start_at, end_at, price)
  values ('X7','OT1','pool','S1000','2026-11-21 10:00+07','2026-11-21 11:00+07',240);
select pg_temp.fails('รอบเต็มแล้ว', $q$insert into booking_pets values ('X7','PT9')$q$, 'session_full');

-- 6 ขนาดไม่ตรงรอบ (15 กก. เข้ารอบน้องเล็ก)
insert into bookings (code, order_code, business_code, session_code, start_at, end_at, price)
  values ('X8','OT1','pool','S1000','2026-11-28 10:00+07','2026-11-28 11:00+07',240);
select pg_temp.fails('ขนาดไม่ตรงรอบ', $q$insert into booking_pets values ('X8','PBIG')$q$, 'size_mismatch');

-- 7 ยังไม่มีวัคซีน → จองสระไม่ได้
update settings set value = 'booking' where key = 'vaccine_check';
select pg_temp.fails('ไม่มีวัคซีน', $q$insert into booking_pets values ('X8','PNOVAC')$q$, 'vaccine_required');
update settings set value = 'checkin' where key = 'vaccine_check';

-- 8 น้องของคนอื่น
select pg_temp.fails('น้องไม่ใช่ของเจ้าของทริป', $q$insert into booking_pets values ('X8','P001')$q$, 'pet_not_owner');

-- 9 รอบเสาร์-อาทิตย์ แต่จองวันจันทร์
select pg_temp.fails('วันไม่ตรงรอบ',
  $q$insert into bookings (code, order_code, business_code, session_code, start_at, end_at, price)
     values ('X9','OT1','pool','S1500','2026-11-23 15:00+07','2026-11-23 16:00+07',240)$q$, 'session_time_mismatch');

-- 10 Villa เกินจำนวนคน
select pg_temp.fails('Villa เกินคน',
  $q$insert into bookings (code, order_code, business_code, unit_code, start_at, end_at, guests, price)
     values ('X10','OT1','villa','LOFT','2026-12-10 14:00+07','2026-12-11 12:00+07',9,3200)$q$, 'too_many_guests');

-- 11 ไม่โอนตามเวลา → ปล่อยที่ แล้วคนอื่นจองห้องนั้นได้
insert into orders (code, customer_code, total, due_now, hold_until) values ('OT2', 'CT', 650, 650, now() - interval '1 min');
insert into bookings (code, order_code, business_code, unit_code, start_at, end_at, price)
  values ('X11','OT2','pet_hotel','COZY2','2026-12-05 16:00+07','2026-12-06 12:00+07',650);
select pg_temp.fails('ก่อนปล่อย ห้องยังไม่ว่าง',
  $q$insert into bookings (code, order_code, business_code, unit_code, start_at, end_at, price)
     values ('X12','OT1','pet_hotel','COZY2','2026-12-05 16:00+07','2026-12-06 12:00+07',650)$q$, 'no_double_stay');
select pg_temp.ok('expire_holds ปล่อย 1 รายการ', expire_holds() >= 1);
select pg_temp.ok('ทริปหมดเวลา', (select status from orders where code = 'OT2') = 'expired');
insert into bookings (code, order_code, business_code, unit_code, start_at, end_at, price)
  values ('X12','OT1','pet_hotel','COZY2','2026-12-05 16:00+07','2026-12-06 12:00+07',650);
select pg_temp.ok('หลังปล่อย จองห้องนั้นได้', true);

-- 12 ตัวช่วย
select pg_temp.ok('รหัสจองถัดไป H-261121-03', next_code('H', '2026-11-21') = 'H-261121-03');
select pg_temp.ok('รหัสสลิปถัดไป PAY-0003', next_code('PAY') = 'PAY-0003');
select pg_temp.ok('มัดจำ Villa 50%', deposit_for('villa', 9600) = 4800);
select pg_temp.ok('มัดจำ Grooming 200', deposit_for('grooming', 550) = 200);
select pg_temp.ok('ขนาด 5 กก. = เล็ก · 5.5 = กลาง', tier_for(5) = 'S' and tier_for(5.5) = 'M');
select pg_temp.ok('สระปิดวันที่ 25', is_closed('pool', 'POOL1', 'S1000', '2026-11-25'));
select pg_temp.ok('LOFT ปิด 1–3 ธ.ค. แต่ TEAK ไม่ปิด', is_closed('villa','LOFT',null,'2026-12-02') and not is_closed('villa','TEAK',null,'2026-12-02'));

-- 13 สิทธิ์: หน้าเว็บ (anon) เห็นข้อมูลร้าน แต่ไม่เห็นลูกค้าและเขียนไม่ได้
set local role anon;
select pg_temp.ok('anon เห็น 4 ธุรกิจ', (select count(*) from businesses) = 4);
select pg_temp.ok('anon ไม่เห็นลูกค้า', (select count(*) from customers) = 0);
select pg_temp.ok('anon ไม่เห็นการจอง', (select count(*) from bookings) = 0);
select pg_temp.ok('anon ไม่เห็นพนักงาน', (select count(*) from staff) = 0);
select pg_temp.ok('anon ไม่เห็นเลขพร้อมเพย์', (select count(*) from settings where key = 'promptpay_id') = 0);
select pg_temp.fails('anon สร้างทริปไม่ได้',
  $q$insert into orders (code, customer_code, total, due_now, hold_until) values ('HACK','C001',0,0,now())$q$, 'permission denied|row-level security');
reset role;

rollback;
\o
\echo 'ผ่านครบทุกข้อ'
