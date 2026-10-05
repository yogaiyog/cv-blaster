import { NextResponse } from 'next/server';
import { getStorageInfo } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  const info = getStorageInfo();
  return NextResponse.json({
    success: true,
    message: `Penyimpanan lokal aktif (${info.appliedJobsCount} lamaran tercatat).`,
    storage: info,
  });
}

export async function POST() {
  const info = getStorageInfo();
  return NextResponse.json({
    success: true,
    message: `Penyimpanan lokal aktif (${info.appliedJobsCount} lamaran tercatat).`,
    storage: info,
  });
}
