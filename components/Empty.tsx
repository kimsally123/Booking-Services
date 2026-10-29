import Link from 'next/link';

// Empty state เดียวกันทุกหน้า: วงกลมไอคอน 64px (เขียว = เสร็จ/ไม่มีงานค้าง · เทา = ยังไม่มีข้อมูล) · หัวข้อ · คำอธิบาย · ปุ่มเมื่อทำต่อได้
export default function Empty({ icon, title, text, tone = 'gray', action }:
  { icon: string; title: string; text: string; tone?: 'green' | 'gray'; action?: { label: string; href: string } }) {
  return (
    <div className="empty">
      <span className={'empty-ic ' + tone}><span className="ms">{icon}</span></span>
      <b>{title}</b>
      <p>{text}</p>
      {action && <Link prefetch={false} href={action.href} className="empty-btn">{action.label}</Link>}
    </div>
  );
}
