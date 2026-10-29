-- สวิตช์อ่านสลิปอัตโนมัติ (เปิดไว้ตั้งแต่แรก · มีผลเมื่อใส่ GOOGLE_VISION_API_KEY ใน env แล้ว)
insert into settings (key, value, note) values ('ocr_enabled', 'on', 'อ่านสลิปด้วย Google Vision (on/off)')
on conflict (key) do nothing;
