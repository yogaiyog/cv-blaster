import { NextRequest, NextResponse } from 'next/server';
import { exportAppliedJobsToCsv, exportQuestionsToCsv } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get('type') || 'applied';

    if (type === 'questions') {
      const csvContent = await exportQuestionsToCsv();
      const filename = `cv-blaster-screening-questions-${new Date().toISOString().split('T')[0]}.csv`;
      return new Response(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

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
