import { NextResponse } from 'next/server';
import { cleanAndFilterCsv } from '@/lib/csvHelper';
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

    const result = cleanAndFilterCsv();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
