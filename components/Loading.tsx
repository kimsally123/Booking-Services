// โครงหน้าระหว่างโหลด · ขึ้นทันทีที่กด ไม่ต้องรอข้อมูลจากฐานข้อมูล
export default function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="body" aria-busy="true" aria-label="กำลังโหลด">
      <div className="sk" style={{ width: '55%', height: 26 }} />
      <div className="sk" style={{ width: '80%', height: 14 }} />
      {Array.from({ length: rows }, (_, i) => <div key={i} className="sk" style={{ height: 72 }} />)}
    </div>
  );
}
