import { NextRequest, NextResponse } from 'next/server';
import { qrPng, qrSigOk } from '@/lib/qrlink';

export const dynamic = 'force-dynamic';

// GET /api/qr/<รหัสการจอง>?s=<ลายเซ็น> → รูป QR พร้อมเพย์ตามยอดที่ต้องโอน (LINE โหลดรูปนี้ไปแสดงในการ์ด)
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!qrSigOk(code, req.nextUrl.searchParams.get('s') || '')) return new NextResponse('not found', { status: 404 });
  const png = await qrPng(code);
  if (!png) return new NextResponse('no qr', { status: 404 });
  return new NextResponse(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=300' } });
}
