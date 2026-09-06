import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import {
  getQuestionsFromSheet,
  saveAllQuestionsToSheet,
  cleanQuestionsInSheet,
  seedQuestionsFromCsvIfEmpty,
  ScreeningQuestionItem,
  invalidateQuestionsCache
} from '@/lib/googleSheets';
import { AppConfig, getConfig } from '@/lib/config';
import { invalidateKnowledgeBaseCache } from '@/lib/questionAnswer';

const CSV_PATH = path.join(process.cwd(), 'public', 'imploye-question.csv');

function parseLocalCsv(): ScreeningQuestionItem[] {
  if (!fs.existsSync(CSV_PATH)) return [];
  try {
    const content = fs.readFileSync(CSV_PATH, 'utf8');
    if (!content.trim()) return [];

    const records: string[][] = parse(content, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
    });

    const questions: ScreeningQuestionItem[] = [];
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
          id: `csv-${i}-${Math.random().toString(36).substring(2, 7)}`,
          question: question.trim(),
          type: type.trim() || 'radiobutton',
          options: options.trim(),
          answer: answer.trim()
        });
      }
    }
    return questions;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    let config: AppConfig = getConfig();
    const configParam = req.nextUrl.searchParams.get('config');
    if (configParam) {
      try {
        config = { ...config, ...JSON.parse(configParam) };
      } catch {}
    }

    // 1. Try Google Sheets if credentials are present
    if (config.googleCredentialsJson && config.spreadsheetId) {
      try {
        const questions = await getQuestionsFromSheet(false, config);
        return NextResponse.json({
          success: true,
          source: 'google_sheets',
          questions,
        });
      } catch (err: any) {
        console.warn('Failed to load questions from Google Sheets, falling back to local:', err?.message || err);
      }
    }

    // 2. Fallback to local CSV
    const questions = parseLocalCsv();
    return NextResponse.json({
      success: true,
      source: 'local_csv',
      questions,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, rawCsv, questions, config: passedConfig } = body;
    const config: AppConfig = getConfig(passedConfig);

    // A. Seed / Migration from CSV to Google Sheets
    if (action === 'seed_from_csv') {
      if (!config.googleCredentialsJson || !config.spreadsheetId) {
        return NextResponse.json({
          success: false,
          error: 'Google Credentials JSON dan Spreadsheet ID belum diisi.'
        }, { status: 400 });
      }

      const seeded = await seedQuestionsFromCsvIfEmpty(config);
      invalidateKnowledgeBaseCache();
      invalidateQuestionsCache();

      return NextResponse.json({
        success: true,
        message: `Berhasil memigrasikan ${seeded.length} pertanyaan ke Google Sheets tab "${config.questionsSheetName || 'Sheet2'}"!`,
        questions: seeded
      });
    }

    // B. Clean duplicate questions
    if (action === 'clean_duplicates') {
      if (config.googleCredentialsJson && config.spreadsheetId) {
        const result = await cleanQuestionsInSheet(config);
        invalidateKnowledgeBaseCache();
        invalidateQuestionsCache();
        return NextResponse.json(result);
      }

      // Fallback clean local CSV if Google Sheets not yet connected
      const current = parseLocalCsv();
      const seen = new Set<string>();
      const unique: ScreeningQuestionItem[] = [];
      for (const item of current) {
        const norm = item.question.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        unique.push(item);
      }

      try {
        const lines = ['Question,Type,Options,Answer'];
        for (const q of unique) {
          lines.push(`"${q.question.replace(/"/g, '""')}","${q.type}","${q.options.replace(/"/g, '""')}","${q.answer.replace(/"/g, '""')}"`);
        }
        fs.writeFileSync(CSV_PATH, lines.join('\n') + '\n', 'utf8');
      } catch {}

      invalidateKnowledgeBaseCache();
      return NextResponse.json({
        success: true,
        message: `Duplikat berhasil dibersihkan! ${unique.length} pertanyaan unik tersimpan.`,
        count: unique.length
      });
    }

    // C. Save all structured questions
    if (action === 'save_all' || Array.isArray(questions)) {
      const targetQuestions: ScreeningQuestionItem[] = questions || [];

      if (config.googleCredentialsJson && config.spreadsheetId) {
        const result = await saveAllQuestionsToSheet(targetQuestions, config);
        invalidateKnowledgeBaseCache();
        invalidateQuestionsCache();
        return NextResponse.json(result);
      }

      // Local fallback
      try {
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
      } catch {}

      invalidateKnowledgeBaseCache();
      return NextResponse.json({
        success: true,
        message: 'Daftar pertanyaan berhasil disimpan!'
      });
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
      for (let i = 1; i < records.length; i++) {
        const cols = records[i];
        if (!cols || cols.length < 2) continue;
        const q = cols[0] || '';
        const type = cols.length >= 4 ? cols[1] : 'radiobutton';
        const options = cols.length >= 4 ? cols[2] : (cols[1] || '');
        const answer = cols.length >= 4 ? cols[3] : (cols[2] || '');
        if (q.trim()) {
          parsedQuestions.push({
            id: `q-raw-${i}`,
            question: q.trim(),
            type: type.trim() || 'radiobutton',
            options: options.trim(),
            answer: answer.trim()
          });
        }
      }

      if (config.googleCredentialsJson && config.spreadsheetId) {
        const result = await saveAllQuestionsToSheet(parsedQuestions, config);
        invalidateKnowledgeBaseCache();
        invalidateQuestionsCache();
        return NextResponse.json(result);
      }

      try {
        fs.writeFileSync(CSV_PATH, rawCsv.trim() + '\n', 'utf8');
      } catch {}

      invalidateKnowledgeBaseCache();
      return NextResponse.json({ success: true, message: 'CSV berhasil diperbarui!' });
    }

    return NextResponse.json({ success: false, error: 'Aksi tidak dikenali' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

