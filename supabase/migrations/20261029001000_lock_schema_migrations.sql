-- ตารางบันทึก migration ใช้ภายในระบบเท่านั้น ปิดไม่ให้ anon/authenticated อ่านผ่าน API
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;
