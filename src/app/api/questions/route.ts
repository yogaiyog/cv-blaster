import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import {
  getQuestionsFromStorage,
  saveAllQuestionsToStorage,
  cleanQuestionsInStorage,
  seedQuestionsFromCsvIfEmpty,
  ScreeningQuestionItem,
  invalidateQuestionsCache,
} from '@/lib/storage';
import { invalidateKnowledgeBaseCache } from '@/lib/questionAnswer';

export async function GET() {
  try {
    const questions = await getQuestionsFromStorage(false);
    return NextResponse.json({
      success: true,
      source: 'local_storage',
      questions,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, rawCsv, questions } = body;

    // A. Seed / Reset from CSV
    if (action === 'seed_from_csv') {
      const seeded = await seedQuestionsFromCsvIfEmpty();
      invalidateKnowledgeBaseCache();
      invalidateQuestionsCache();

      return NextResponse.json({
        success: true,
        message: `Berhasil memuat ${seeded.length} pertanyaan default ke penyimpanan lokal!`,
        questions: seeded,
      });
    }

    // B. Clean duplicate questions
    if (action === 'clean_duplicates') {
      const result = await cleanQuestionsInStorage();
      invalidateKnowledgeBaseCache();
      invalidateQuestionsCache();
      return NextResponse.json(result);
    }

    // C. Save all structured questions
    if (action === 'save_all' || Array.isArray(questions)) {
      const targetQuestions: ScreeningQuestionItem[] = questions || [];
      const result = await saveAllQuestionsToStorage(targetQuestions);
      invalidateKnowledgeBaseCache();
      invalidateQuestionsCache();
      return NextResponse.json(result);
    }

    // D. Save Raw CSV Text
    if (action === 'save_raw') {
      if (typeof rawCsv !== 'string') {
        return NextResponse.json({ success: false, error: 'rawCsv harus berupa string' }, { status: 400 });
      }

      const records: string[][] = parse(rawCsv, {
        columns: false,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
      });

      const parsedQuestions: ScreeningQuestionItem[] = [];
      const dateStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

      for (let i = 1; i < records.length; i++) {
        const cols = records[i];
        if (!cols || cols.length < 2) continue;
        const q = cols[0] || '';
        const type = cols.length >= 4 ? cols[1] : 'radiobutton';
        const options = cols.length >= 4 ? cols[2] : cols[1] || '';
        const answer = cols.length >= 4 ? cols[3] : cols[2] || '';
        if (q.trim()) {
          parsedQuestions.push({
            id: `q-raw-${i}-${Date.now()}`,
            question: q.trim(),
            type: type.trim() || 'radiobutton',
            options: options.trim(),
            answer: answer.trim(),
            updatedAt: dateStr,
          });
        }
      }

      const result = await saveAllQuestionsToStorage(parsedQuestions);
      invalidateKnowledgeBaseCache();
      invalidateQuestionsCache();
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: false, error: 'Aksi tidak dikenali' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
