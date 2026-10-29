-- ยอดคงเหลือก่อนวันใช้บริการ (Villa: ครบก่อนเช็กอิน 7 วัน · จองใกล้กว่านั้นจ่ายเต็ม)
alter table businesses add column balance_days int check (balance_days between 1 and 60);
update businesses set balance_days = 7 where code = 'villa' and balance_days is null;

-- มัดจำแบบ "ค่าคืนแรก" (ที่พัก)
alter table businesses drop constraint businesses_deposit_type_check;
alter table businesses add constraint businesses_deposit_type_check
  check (deposit_type in ('full','percent','fixed','first_night'));
alter table businesses drop constraint businesses_check;
alter table businesses add constraint businesses_check check (deposit_type in ('full','first_night') or deposit_value is not null);

-- สลิปของอะไร: มัดจำ/ยอดตอนจอง · ยอดคงเหลือออนไลน์ · รับที่ร้าน (เงินสด/โอน)
alter table payments add column purpose text not null default 'deposit' check (purpose in ('deposit','balance','shop'));
alter table payments add column method text check (method in ('transfer','cash'));
alter table payments alter column slip_file drop not null;
alter table payments add constraint payments_slip_needed check (purpose = 'shop' or slip_file is not null);

-- แจ้งพนักงานใน LINE เมื่อมีสลิปรอตรวจ (ใช้โควตาข้อความ)
insert into settings (key, value, note) values ('msg_staff_slip', 'on', 'แจ้งพนักงานใน LINE เมื่อมีสลิปรอตรวจ')
on conflict (key) do nothing;
