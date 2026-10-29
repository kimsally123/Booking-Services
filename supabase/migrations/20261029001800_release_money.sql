-- ทริปที่หมดเวลา/ถูกยกเลิกอัตโนมัติ: คืนเครดิตที่ใช้ และตั้งยอดเงินโอนที่ได้รับแล้วเป็น "รอโอนคืน"
-- คิวข้อความ: สถานะ sending กันรอบส่งทับกันหยิบแถวเดิม

alter table notifications drop constraint notifications_status_check;
alter table notifications add constraint notifications_status_check check (status in ('queued','sending','sent','failed'));
alter table notifications add column claimed_at timestamptz;

create or replace function release_money(p_code text) returns void
language plpgsql as $$
declare o record; used numeric; back numeric; cash numeric;
begin
  select code, status, customer_code, paid_amount, refund_amount, refund_status into o from orders where code = p_code for update;
  if not found or o.refund_status is not null or o.status not in ('cancelled', 'expired') then return; end if;
  select coalesce(-sum(amount) filter (where amount < 0), 0), coalesce(sum(amount) filter (where amount > 0), 0)
    into used, back from credits where order_code = p_code;
  used := greatest(used - back, 0);
  if used > 0 then
    insert into credits (customer_code, amount, order_code, note, created_by)
    values (o.customer_code, used, p_code, 'คืนเครดิตที่ใช้ (การจองไม่สำเร็จ)', 'system');
  end if;
  cash := greatest(o.paid_amount - used - o.refund_amount, 0);
  if used > 0 or cash > 0 then
    update orders set refund_status = case when cash > 0 then 'pending' else 'credited' end,
                      refund_amount = refund_amount + case when cash > 0 then cash else used end   -- รอโอนคืน = เฉพาะเงินโอน (เครดิตคืนเข้าบัญชีแล้ว)
    where code = p_code;
  end if;
end $$;
revoke execute on function release_money(text) from public, anon, authenticated;

create or replace function expire_holds() returns int
language plpgsql as $$
declare n int := 0; c text;
begin
  for c in update orders set status = 'expired'
           where status = 'holding' and hold_until < now()
           returning code loop
    update bookings set status = 'expired' where order_code = c and status = 'holding';
    perform release_money(c);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function expire_holds() from public, anon, authenticated;

-- Villa: ยอดคงเหลือก่อนเช็กอิน 7 วัน (ติดตั้งใหม่ที่ seed ลงหลัง migration 1600)
update businesses set balance_days = 7 where code = 'villa' and balance_days is null;
