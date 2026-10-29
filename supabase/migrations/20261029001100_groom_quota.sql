-- โควตาคิว Grooming ต่อช่างต่อวัน (ปฏิทินขึ้น "เต็ม" เมื่อช่างทุกคนครบโควตา)
alter table staff add column daily_quota smallint not null default 4 check (daily_quota between 1 and 50);
