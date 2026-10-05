import { NextResponse } from 'next/server';
import { exportAppliedJobsToCsv } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const csvContent = await exportAppliedJobsToCsv();
    const filename = `cv-blaster-applied-jobs-${new Date().toISOString().split('T')[0]}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
