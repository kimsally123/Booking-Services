import type { NextConfig } from 'next';

const config: NextConfig = {
  // เปิดใน LIFF (iframe/webview ของ LINE) ได้
  poweredByHeader: false,
  serverExternalPackages: ['postgres'],
  // /api/ping?full=1 เทียบไฟล์ migration กับฐานข้อมูล
  outputFileTracingIncludes: { '/api/ping': ['./supabase/migrations/*.sql'] },
};
export default config;
