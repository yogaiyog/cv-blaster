import { NextRequest, NextResponse } from 'next/server';
import { getAppliedJobs, clearAllAppliedJobs } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const list = await getAppliedJobs(true);
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const list = await getAppliedJobs(true);
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearAllAppliedJobs();
    return NextResponse.json({ success: true, message: 'Riwayat lamaran berhasil dikosongkan.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
