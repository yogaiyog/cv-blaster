import { NextResponse } from 'next/server';
import { testSheetsConnection } from '@/lib/googleSheets';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await testSheetsConnection();
  return NextResponse.json(result);
}
