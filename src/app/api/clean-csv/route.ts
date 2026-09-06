import { NextResponse } from 'next/server';
import { cleanQuestionsInSheet } from '@/lib/googleSheets';
import { getConfig } from '@/lib/config';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const config = getConfig(body.config || body);

    if (config.googleCredentialsJson && config.spreadsheetId) {
      const result = await cleanQuestionsInSheet(config);
      return NextResponse.json(result);
    }

    return NextResponse.json({
      success: false,
      message: 'Google Sheets belum terhubung. Konfigurasi Spreadsheet ID dan Credentials terlebih dahulu.'
    }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
