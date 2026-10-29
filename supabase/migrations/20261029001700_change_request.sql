-- ลูกค้าขอยกเลิก/ขอเลื่อนจากหน้าการจอง → แจ้งร้าน (ร้านเป็นคนกดและคืนเงินตามเงื่อนไข)
alter table orders add column change_request text;
alter table orders add column change_request_at timestamptz;
