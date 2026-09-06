import { NextResponse } from 'next/server';
import { getConfig, saveConfig } from '@/lib/config';
import { initializeSheet } from '@/lib/googleSheets';

export async function GET() {
  const config = getConfig();
  return NextResponse.json({ success: true, config, ...config });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const updated = saveConfig(body);

    // If Google Sheet config is provided, initialize headers in the background without blocking the save response
    if (updated.spreadsheetId && updated.googleCredentialsJson) {
      initializeSheet(updated).catch((sheetError) => {
        console.warn('Could not initialize Google Sheet headers yet:', sheetError?.message || sheetError);
      });
    }

    return NextResponse.json({ success: true, config: updated, message: 'Konfigurasi berhasil disimpan!' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
