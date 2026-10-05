import { NextRequest, NextResponse } from 'next/server';
import { importAppliedJobsFromCsv } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData().catch(() => null);
    let csvText = '';

    if (formData) {
      const file = formData.get('file') as File | null;
      if (file) {
        csvText = await file.text();
      }
    }

    if (!csvText) {
      const body = await req.json().catch(() => null);
      if (body && typeof body.csvText === 'string') {
        csvText = body.csvText;
      }
    }

    if (!csvText || !csvText.trim()) {
      return NextResponse.json(
        { success: false, error: 'File atau konten CSV tidak ditemukan.' },
        { status: 400 }
      );
    }

    const result = await importAppliedJobsFromCsv(csvText);

    return NextResponse.json({
      success: true,
      message: `Berhasil mengimpor ${result.importedCount} lamaran baru (${result.skippedCount} duplikat dilewati). Total: ${result.totalCount} lamaran.`,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
