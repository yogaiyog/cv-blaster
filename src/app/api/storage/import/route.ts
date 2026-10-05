import { NextRequest, NextResponse } from 'next/server';
import { importAppliedJobsFromCsv, importQuestionsFromCsv } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData().catch(() => null);
    let csvText = '';
    let type = req.nextUrl.searchParams.get('type') || '';

    if (formData) {
      const file = formData.get('file') as File | null;
      if (file) {
        csvText = await file.text();
      }
      if (!type) {
        type = (formData.get('type') as string) || '';
      }
    }

    if (!csvText) {
      const body = await req.json().catch(() => null);
      if (body) {
        if (typeof body.csvText === 'string') csvText = body.csvText;
        if (!type && body.type) type = body.type;
      }
    }

    if (!csvText || !csvText.trim()) {
      return NextResponse.json(
        { success: false, error: 'File atau konten CSV tidak ditemukan.' },
        { status: 400 }
      );
    }

    if (type === 'questions') {
      const result = await importQuestionsFromCsv(csvText);
      return NextResponse.json({
        success: true,
        message: `Berhasil mengimpor ${result.importedCount} pertanyaan baru (${result.updatedCount} diperbarui). Total: ${result.totalCount} pertanyaan.`,
        data: result,
      });
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
