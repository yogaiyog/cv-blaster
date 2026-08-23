import fs from 'fs';
import path from 'path';

export function appendQuestionToCsv(
  question: string, 
  type: 'dropdown' | 'checklist' | 'radiobutton', 
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
  } catch (error) {
    console.error('Failed to write to CSV:', error);
  }
}

export function cleanAndFilterCsv(): { success: boolean; message: string; count?: number } {
  const inputPath = path.join(process.cwd(), 'public', 'imploye-question.csv');
  const outputPath = path.join(process.cwd(), 'public', 'imploye-question-clean.csv');

  if (!fs.existsSync(inputPath)) {
    return { success: false, message: 'Source CSV file does not exist yet.' };
  }

  try {
    const content = fs.readFileSync(inputPath, 'utf8');
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length <= 1) {
      return { success: false, message: 'CSV file is empty or only contains header.' };
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

      // Handle both cases: if file was already clean (4 columns) or old (5 columns with Job URL)
      let question = '';
      let type = '';
      let options = '';
      let answer = '';

      if (cols.length === 5) {
        // Old format: Job URL, Question, Type, Options, Answer
        question = cols[1];
        type = cols[2];
        options = cols[3];
        answer = cols[4];
      } else if (cols.length === 4) {
        const isUrl = cols[0].startsWith('http://') || cols[0].startsWith('https://');
        if (isUrl) {
          // Old Raw No Type: Job URL, Question, Options, Answer
          question = cols[1];
          type = '';
          options = cols[2];
          answer = cols[3];
        } else {
          // Check if cols[1] contains Options separator '|'
          if (cols[1].includes('|')) {
            // Legacy format misaligned: Question, Options, Answer, Empty
            question = cols[0];
            type = '';
            options = cols[1];
            answer = cols[2] || '';
          } else {
            // Clean format: Question, Type, Options, Answer
            question = cols[0];
            type = cols[1];
            options = cols[2];
            answer = cols[3];
          }
        }
      } else if (cols.length === 3) {
        // Legacy format: Question, Options, Answer
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

    fs.writeFileSync(outputPath, cleanedRows.join('\n') + '\n', 'utf8');
    return { 
      success: true, 
      message: `Cleaned CSV generated successfully at public/imploye-question-clean.csv`,
      count: uniqueQuestions.size 
    };
  } catch (error: any) {
    console.error('Failed to clean CSV:', error);
    return { success: false, message: `Error: ${error.message || error}` };
  }
}
