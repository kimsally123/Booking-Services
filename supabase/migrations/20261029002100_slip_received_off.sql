-- "ได้รับสลิปแล้ว" แบบ push ปิดไว้ก่อน: ลูกค้ากด "ส่งยืนยันการจองเข้าแชท" แล้วได้การ์ดสถานะด้วย reply (ไม่ใช้โควตา)
insert into settings (key, value) values ('msg_slip_received', 'off') on conflict (key) do nothing;
