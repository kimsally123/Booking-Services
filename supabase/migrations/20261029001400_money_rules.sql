-- เงินหลังจ่าย: รับบางส่วน · นับครั้งสลิปไม่ผ่าน · ยอดที่ได้รับจริง · ที่มาของการยกเลิก
alter table payments drop constraint payments_status_check;
alter table payments add constraint payments_status_check check (status in ('pending','approved','rejected','partial'));
alter table payments add column reject_kind text;                       -- not_found | wrong_order | other

alter table orders add column paid_amount numeric(10,2) not null default 0;   -- ยอดที่ร้านยืนยันว่าได้รับจริง
alter table orders add column reject_count int not null default 0;            -- ร้านกดสลิปไม่ผ่านกี่ครั้ง
alter table orders add column cancel_source text;                             -- slip | staff | customer | closed

-- แบบข้อความใหม่ + อีเมลถึงลูกค้า (to_customer)
alter table notifications drop constraint notifications_template_check;
alter table notifications add constraint notifications_template_check
  check (template in ('confirm','reminder','paid','cancelled','groom_done','new_booking','slip_review','slip_rejected',
                      'vaccine_ok','vaccine_rejected','vaccine_review','delete_request','rescheduled',
                      'partial','balance_due','refund','closed_day','staff_new'));
alter table notifications add column to_customer boolean not null default false;

-- คืนเงิน / เครดิต / ริบมัดจำ (ตามเงื่อนไขยกเลิกของธุรกิจ)
alter table orders add column refund_status text check (refund_status in ('pending','credited','refunded','forfeited'));
alter table orders add column refund_amount numeric(10,2) not null default 0 check (refund_amount >= 0);
-- ยอดค้างที่ต้องจ่ายก่อนวันใช้บริการ (Villa: ส่วนที่เหลือก่อนเช็กอิน 7 วัน)
alter table orders add column balance_due numeric(10,2) not null default 0 check (balance_due >= 0);
alter table orders add column balance_due_by date;

create table credits (
  id            bigint generated always as identity primary key,
  customer_code text not null references customers(code) on update cascade on delete cascade,
  amount        numeric(10,2) not null,            -- + ได้เครดิต · − ใช้เครดิต
  order_code    text references orders(code) on update cascade on delete set null,
  note          text,
  created_by    text,                              -- รหัสพนักงาน หรือ system
  created_at    timestamptz not null default now()
);
create index on credits (customer_code, created_at desc);
alter table credits enable row level security;
revoke all on credits from anon, authenticated;
