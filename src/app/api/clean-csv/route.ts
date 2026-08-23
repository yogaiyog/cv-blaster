import { NextResponse } from 'next/server';
import { cleanAndFilterCsv } from '@/lib/csvHelper';

export async function POST() {
  try {
    const result = cleanAndFilterCsv();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
