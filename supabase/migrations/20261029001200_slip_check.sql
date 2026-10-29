-- ตรวจสลิปเบื้องต้น: เลขอ้างอิงจาก QR ในสลิป · ลายนิ้วมือรูป · ยอดที่อ่านได้ · จุดที่ต้องดู
-- ใช้คัดกรองเท่านั้น · พนักงานต้องเห็นเงินเข้าในแอปธนาคารก่อนกดผ่านเสมอ
alter table payments add column slip_ref  text;          -- เลขอ้างอิงรายการ (จาก QR ในสลิป)
alter table payments add column slip_hash text;          -- sha256 ของไฟล์ (กันส่งรูปเดิมซ้ำ)
alter table payments add column ocr_amount numeric(10,2);
alter table payments add column checks jsonb not null default '{}';
create unique index payments_slip_ref on payments (slip_ref) where slip_ref is not null;
create unique index payments_slip_hash on payments (slip_hash) where slip_hash is not null;
alter table orders add column slip_dup_count int not null default 0;   -- ครั้งที่ส่งสลิปซ้ำ/ไม่ใช่สลิป

insert into settings (key, value, note) values
  ('ocr_month_limit', '1000', 'จำนวนรูปที่อ่านด้วย Google Vision ต่อเดือน (ฟรี 1,000) · เกินแล้วให้พนักงานอ่านเอง')
on conflict (key) do nothing;
