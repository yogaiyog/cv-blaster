import { NextResponse } from 'next/server';
import { getStorageInfo } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const info = getStorageInfo();
    return NextResponse.json({ success: true, data: info });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
