-- รูปโปรไฟล์น้อง (bucket photos · ชื่อไฟล์สุ่ม · ย่อและลบข้อมูลตำแหน่งในรูปก่อนเก็บ)
alter table pets add column if not exists photo text;
