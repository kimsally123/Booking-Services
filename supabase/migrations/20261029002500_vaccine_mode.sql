-- วัคซีน: checkin = จองได้ก่อน ร้านตรวจสมุดวัคซีนวันมาใช้บริการ (ค่าเริ่ม) · booking = ต้องผ่านตรวจก่อนจอง
insert into settings (key, value, note) values ('vaccine_check', 'checkin', 'checkin = จองได้ก่อนตรวจวัคซีน · booking = ต้องผ่านตรวจก่อนจอง')
on conflict (key) do nothing;

create or replace function vaccine_ok(p_pet text, p_on date) returns boolean
language sql stable as $$
  select coalesce((select value from settings where key = 'vaccine_check'), 'booking') = 'checkin'
      or exists (select 1 from pet_vaccines
                 where pet_code = p_pet and status = 'approved' and expires_on >= p_on)
$$;
revoke execute on function vaccine_ok(text, date) from public, anon, authenticated;
