import { NextRequest, NextResponse } from 'next/server';
import { getAppliedJobs } from '@/lib/googleSheets';
import { AppConfig, getConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    let config: AppConfig = getConfig();
    const configParam = req.nextUrl.searchParams.get('config');
    if (configParam) {
      try {
        config = { ...config, ...JSON.parse(configParam) };
      } catch {}
    }
    const list = await getAppliedJobs(true, config);
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const config = getConfig(body.config || body);
    const list = await getAppliedJobs(true, config);
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
