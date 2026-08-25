import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const CSV_PATH = path.join(process.cwd(), 'public', 'imploye-question.csv');

export async function GET() {
  try {
    if (!fs.existsSync(CSV_PATH)) {
      return NextResponse.json({
        success: true,
        questions: [],
        rawCsv: 'Question,Type,Options,Answer\n'
      });
    }

    const content = fs.readFileSync(CSV_PATH, 'utf8');
    if (!content.trim()) {
      return NextResponse.json({
        success: true,
        questions: [],
        rawCsv: ''
      });
    }

    const records: string[][] = parse(content, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
    });

    const questions: Array<{
      id: string;
      question: string;
      type: string;
      options: string;
      answer: string;
    }> = [];

    // Skip header row at index 0
    for (let i = 1; i < records.length; i++) {
      const cols = records[i];
      if (!cols || cols.length < 2) continue;

      let question = '';
      let type = '';
      let options = '';
      let answer = '';

      if (cols.length >= 4) {
        question = cols[0] || '';
        type = cols[1] || '';
        options = cols[2] || '';
        answer = cols[3] || '';
      } else if (cols.length === 3) {
        question = cols[0] || '';
        options = cols[1] || '';
        answer = cols[2] || '';
      }

      if (question.trim()) {
        questions.push({
          id: `q-${i}-${Math.random().toString(36).substring(2, 7)}`,
          question: question.trim(),
          type: type.trim() || 'radiobutton',
          options: options.trim(),
          answer: answer.trim()
        });
      }
    }

    return NextResponse.json({
      success: true,
      questions,
      rawCsv: content
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, rawCsv, questions } = body;

    // 1. Simpan CSV Mentah (Raw Text Edit)
    if (action === 'save_raw') {
      if (typeof rawCsv !== 'string') {
        return NextResponse.json({ success: false, error: 'rawCsv harus berupa string' }, { status: 400 });
      }
      fs.writeFileSync(CSV_PATH, rawCsv.trim() + '\n', 'utf8');
      try {
        const { invalidateKnowledgeBaseCache } = require('@/lib/questionAnswer');
        invalidateKnowledgeBaseCache();
      } catch {}
      return NextResponse.json({ success: true, message: 'CSV berhasil diperbarui!' });
    }

    // 2. Simpan Seluruh Daftar Pertanyaan (Structured Save)
    if (action === 'save_all' || Array.isArray(questions)) {
      const targetQuestions = questions || [];
      const lines: string[] = ['Question,Type,Options,Answer'];

      for (const q of targetQuestions) {
        if (!q.question || !q.question.trim()) continue;
        const escQ = `"${(q.question || '').replace(/"/g, '""')}"`;
        const escType = `"${(q.type || 'radiobutton').replace(/"/g, '""')}"`;
        const escOpt = `"${(q.options || '').replace(/"/g, '""')}"`;
        const escAns = `"${(q.answer || '').replace(/"/g, '""')}"`;
        lines.push(`${escQ},${escType},${escOpt},${escAns}`);
      }

      fs.writeFileSync(CSV_PATH, lines.join('\n') + '\n', 'utf8');
      try {
        const { invalidateKnowledgeBaseCache } = require('@/lib/questionAnswer');
        invalidateKnowledgeBaseCache();
      } catch {}
      return NextResponse.json({ success: true, message: 'Pertanyaan berhasil disimpan!' });
    }

    return NextResponse.json({ success: false, error: 'Aksi tidak dikenali' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
