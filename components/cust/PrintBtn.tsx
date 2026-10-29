'use client';
export default function PrintBtn() {
  return <button className="btnw line noprint" onClick={() => window.print()}><span className="ms">download</span>พิมพ์ / บันทึกเป็น PDF</button>;
}
