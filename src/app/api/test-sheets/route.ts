import { NextRequest, NextResponse } from 'next/server';
import { testSheetsConnection } from '@/lib/googleSheets';
import { AppConfig, getConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  let config: AppConfig = getConfig();
  const configParam = req.nextUrl.searchParams.get('config');
  if (configParam) {
    try {
      config = { ...config, ...JSON.parse(configParam) };
    } catch {}
  }
  const result = await testSheetsConnection(config);
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const config = getConfig(body.config || body);
    const result = await testSheetsConnection(config);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
