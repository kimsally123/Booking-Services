import Link from 'next/link';

// หัวหน้าหลังบ้าน: บรรทัดเล็ก + ชื่อใหญ่ (มีปุ่มย้อนกลับได้)
export default function Head({ cap, title, back }: { cap?: string; title: string; back?: string }) {
  if (back) return (
    <div className="head">
      <Link prefetch={false} href={back} className="back"><span className="ms">arrow_back</span></Link>
      <div className="t">{cap && <span className="cap">{cap}</span>}<b>{title}</b></div>
    </div>
  );
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{cap && <span className="cap">{cap}</span>}<div className="title">{title}</div></div>;
}
