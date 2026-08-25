import fs from 'fs';
import path from 'path';

export function appendQuestionToCsv(
  question: string, 
  type: 'dropdown' | 'checklist' | 'radiobutton' | 'text' | 'unknown' | string, 
  options: string[],
  answers: string[]
) {
  const csvPath = path.join(process.cwd(), 'public', 'imploye-question.csv');
  
  try {
    const dir = path.dirname(csvPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const normalizedNewQuestion = question.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, 'utf8');
      const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      const parseCsvLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current);
        return result;
      };

      // Check for duplicate questions in existing entries
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const existingQuestion = cols[0] || ''; // Question is now column 0
        const normalizedExisting = existingQuestion.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        if (normalizedNewQuestion === normalizedExisting) {
          return; // Duplicate found, skip appending
        }
      }
    } else {
      fs.writeFileSync(csvPath, 'Question,Type,Options,Answer\n', 'utf8');
    }

    const escapedQuestion = `"${question.replace(/"/g, '""')}"`;
    const escapedType = `"${type.replace(/"/g, '""')}"`;
    const escapedOptions = `"${options.join(' | ').replace(/"/g, '""')}"`;
    const escapedAnswers = `"${answers.join(' || ').replace(/"/g, '""')}"`;

    fs.appendFileSync(csvPath, `${escapedQuestion},${escapedType},${escapedOptions},${escapedAnswers}\n`, 'utf8');

    // Invalidate in-memory knowledge base cache so next lookup includes this new question immediately
    try {
      const { invalidateKnowledgeBaseCache } = require('./questionAnswer');
      invalidateKnowledgeBaseCache();
    } catch {}
  } catch (error) {
    console.error('Failed to write to CSV:', error);
  }
}

export function cleanAndFilterCsv(): { success: boolean; message: string; count?: number } {
  const csvPath = path.join(process.cwd(), 'public', 'imploye-question.csv');
  const tempCleanPath = path.join(process.cwd(), 'public', 'imploye-question-clean.csv');

  if (!fs.existsSync(csvPath)) {
    return { success: false, message: 'File imploye-question.csv belum ditemukan.' };
  }

  try {
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length <= 1) {
      return { success: false, message: 'File CSV masih kosong atau hanya berisi header.' };
    }

    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current);
      return result;
    };

    const uniqueQuestions = new Set<string>();
    const cleanedRows: string[] = [];

    cleanedRows.push('Question,Type,Options,Answer');

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 2) continue;

      let question = '';
      let type = '';
      let options = '';
      let answer = '';

      if (cols.length === 5) {
        // Format lama: Job URL, Question, Type, Options, Answer
        question = cols[1];
        type = cols[2];
        options = cols[3];
        answer = cols[4];
      } else if (cols.length === 4) {
        const isUrl = cols[0].startsWith('http://') || cols[0].startsWith('https://');
        if (isUrl) {
          question = cols[1];
          type = '';
          options = cols[2];
          answer = cols[3];
        } else {
          if (cols[1].includes('|')) {
            question = cols[0];
            type = '';
            options = cols[1];
            answer = cols[2] || '';
          } else {
            question = cols[0];
            type = cols[1];
            options = cols[2];
            answer = cols[3];
          }
        }
      } else if (cols.length === 3) {
        question = cols[0];
        type = '';
        options = cols[1];
        answer = cols[2];
      }

      const normalized = question.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      if (!normalized || uniqueQuestions.has(normalized)) {
        continue;
      }

      uniqueQuestions.add(normalized);

      const escapedQuestion = `"${question.replace(/"/g, '""')}"`;
      const escapedType = `"${type.replace(/"/g, '""')}"`;
      const escapedOptions = `"${options.replace(/"/g, '""')}"`;
      const escapedAnswer = `"${answer.replace(/"/g, '""')}"`;

      cleanedRows.push(`${escapedQuestion},${escapedType},${escapedOptions},${escapedAnswer}`);
    }

    // Tulis langsung kembali ke public/imploye-question.csv
    fs.writeFileSync(csvPath, cleanedRows.join('\n') + '\n', 'utf8');

    // Hapus file imploye-question-clean.csv jika ada
    if (fs.existsSync(tempCleanPath)) {
      try {
        fs.unlinkSync(tempCleanPath);
      } catch {}
    }

    // Invalidate in-memory knowledge base cache
    try {
      const { invalidateKnowledgeBaseCache } = require('./questionAnswer');
      invalidateKnowledgeBaseCache();
    } catch {}

    return { 
      success: true, 
      message: `Duplikat berhasil dibersihkan! ${uniqueQuestions.size} pertanyaan unik tersimpan di public/imploye-question.csv`,
      count: uniqueQuestions.size 
    };
  } catch (error: any) {
    console.error('Failed to clean CSV:', error);
    return { success: false, message: `Error: ${error.message || error}` };
  }
}
