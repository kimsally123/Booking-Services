-- ข้อความใหม่ถึงลูกค้า: รับการจองแล้ว (พร้อม QR) · ได้รับสลิปแล้ว
alter table notifications drop constraint notifications_template_check;
alter table notifications add constraint notifications_template_check
  check (template in ('confirm','reminder','paid','cancelled','groom_done','new_booking','slip_review','slip_rejected',
                      'vaccine_ok','vaccine_rejected','vaccine_review','delete_request','rescheduled',
                      'partial','balance_due','refund','closed_day','staff_new','booked','slip_received'));
