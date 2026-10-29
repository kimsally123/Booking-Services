-- รอบตั้งเวลาทุก 5 นาที (ปล่อยที่ที่หมดเวลา + ส่ง LINE/อีเมลที่ถึงเวลา เช่น เตือนก่อนวัน ยอดคงเหลือ)
-- Vercel แพลนฟรีตั้งได้วันละครั้ง (vercel.json) · ใช้ Supabase เรียกทุก 5 นาทีแทน
-- วิธีใช้: Supabase → SQL Editor → วางไฟล์นี้ → แก้ 2 บรรทัดที่มี <...> แล้วกด Run (รันครั้งเดียว)
--   <โดเมน>       เช่น bookingservice-gilt.vercel.app
--   <CRON_SECRET> ค่าเดียวกับใน Vercel env (อย่าส่งค่านี้ในแชท)
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'booking-tick';
select cron.schedule('booking-tick', '*/5 * * * *', $$
  select net.http_get(
    url := 'https://<โดเมน>/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 30000);
$$);
-- ดูว่าทำงานไหม: select * from cron.job_run_details order by start_time desc limit 5;
