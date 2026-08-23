import { NextResponse } from 'next/server';
import { getConfig, saveConfig } from '@/lib/config';
import { initializeSheet } from '@/lib/googleSheets';

export async function GET() {
  return NextResponse.json(getConfig());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const updated = saveConfig(body);

    // If Google Sheet config is provided, try initializing sheet headers
    if (updated.spreadsheetId && updated.googleCredentialsJson) {
      try {
        await initializeSheet();
      } catch (sheetError) {
        console.warn('Could not initialize Google Sheet headers yet:', sheetError);
      }
    }

    return NextResponse.json({ success: true, config: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
