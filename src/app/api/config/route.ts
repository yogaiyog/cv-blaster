import { NextResponse } from 'next/server';
import { getConfig, saveConfig } from '@/lib/config';

export async function GET() {
  const config = getConfig();
  return NextResponse.json({ success: true, config, ...config });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const updated = saveConfig(body);

    return NextResponse.json({ success: true, config: updated, message: 'Konfigurasi berhasil disimpan!' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
