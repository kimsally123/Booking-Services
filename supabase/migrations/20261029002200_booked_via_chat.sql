-- การ์ดรับการจองแบบ push ปิดเป็นค่าเริ่ม: ลูกค้ากด "ยืนยันการจองผ่านแชท" แล้วได้การ์ด + QR ด้วย reply (ไม่ใช้โควตา)
insert into settings (key, value) values ('msg_booked', 'off') on conflict (key) do nothing;
