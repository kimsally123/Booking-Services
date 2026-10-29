-- ภาพตัวอย่าง (อยู่ใน public/demo ของเว็บ) แทนชื่อไฟล์ตัวอย่างจาก Excel ที่ไม่มีไฟล์จริง
-- ห้อง/บริการที่ร้านอัปโหลดรูปเองแล้ว ไม่แตะ · ร้านลบภาพตัวอย่างแล้วใส่รูปจริงได้ในหลังบ้าน
delete from unit_photos where file in ('teak-01.jpg','teak-02.jpg','teak-03.jpg','loft-01.jpg','cozy-01.jpg','garden-01.jpg','pool-01.jpg','g-bath.jpg');

insert into unit_photos (file, caption, is_cover, sort, unit_code)
select v.file, v.caption, v.cover, v.sort, v.unit from (values
  ('/demo/villa-house.jpg',  'ภาพตัวอย่าง · หน้าบ้านและลานนั่งเล่น', true, 1, 'TEAK'),
  ('/demo/villa-living.jpg', 'ภาพตัวอย่าง · ห้องนั่งเล่น',            false, 2, 'TEAK'),
  ('/demo/villa-living.jpg', 'ภาพตัวอย่าง · ห้องนั่งเล่น',            true, 1, 'LOFT'),
  ('/demo/villa-house.jpg',  'ภาพตัวอย่าง · ลานหน้าบ้าน',            false, 2, 'LOFT'),
  ('/demo/hotel-glass.jpg',  'ภาพตัวอย่าง · ห้องพักน้อง',            true, 1, 'COZY1'),
  ('/demo/hotel-pods.jpg',   'ภาพตัวอย่าง · มุมนอน',                 false, 2, 'COZY1'),
  ('/demo/hotel-pods.jpg',   'ภาพตัวอย่าง · มุมนอน',                 true, 1, 'COZY2'),
  ('/demo/hotel-glass.jpg',  'ภาพตัวอย่าง · ห้องพักน้อง',            false, 2, 'COZY2'),
  ('/demo/hotel-loft.jpg',   'ภาพตัวอย่าง · ห้องมีชั้นลอย',          true, 1, 'GARDEN1'),
  ('/demo/hotel-suite.jpg',  'ภาพตัวอย่าง · ห้องกว้าง',              false, 2, 'GARDEN1'),
  ('/demo/hotel-suite.jpg',  'ภาพตัวอย่าง · ห้องกว้าง',              true, 1, 'GARDEN2'),
  ('/demo/hotel-loft.jpg',   'ภาพตัวอย่าง · ห้องมีชั้นลอย',          false, 2, 'GARDEN2'),
  ('/demo/pool.jpg',         'ภาพตัวอย่าง · สระน้องหมา',             true, 1, 'POOL1')
) as v(file, caption, cover, sort, unit)
where exists (select 1 from units u where u.code = v.unit)
  and not exists (select 1 from unit_photos p where p.unit_code = v.unit);

insert into unit_photos (file, caption, is_cover, sort, service_code)
select v.file, v.caption, true, 1, v.svc from (values
  ('/demo/groom-bath.jpg',    'ภาพตัวอย่าง', 'G-BATH'),
  ('/demo/groom-done.jpg',    'ภาพตัวอย่าง', 'G-CUT'),
  ('/demo/groom-scissor.jpg', 'ภาพตัวอย่าง', 'G-STYLE'),
  ('/demo/groom-scissor.jpg', 'ภาพตัวอย่าง', 'G-SPOT'),
  ('/demo/groom-bath.jpg',    'ภาพตัวอย่าง', 'G-DRY')
) as v(file, caption, svc)
where exists (select 1 from services s where s.code = v.svc)
  and not exists (select 1 from unit_photos p where p.service_code = v.svc);
