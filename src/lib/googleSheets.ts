import { google } from 'googleapis';
import { AppConfig, getConfig } from './config';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

export interface ScreeningQuestionItem {
  id?: string;
  question: string;
  type: string;
  options: string;
  answer: string;
  updatedAt?: string;
}

export function getSheetsClient(customConfig?: AppConfig) {
  const config = customConfig || getConfig();
  if (!config.googleCredentialsJson) {
    throw new Error('Google Credentials JSON are not configured.');
  }
  if (!config.spreadsheetId) {
    throw new Error('Spreadsheet ID is not configured.');
  }

  try {
    const credentials = typeof config.googleCredentialsJson === 'string'
      ? JSON.parse(config.googleCredentialsJson)
      : config.googleCredentialsJson;

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    return google.sheets({ version: 'v4', auth });
  } catch (error: any) {
    console.error('Failed to initialize Google Sheets client:', error?.message || error);
    throw new Error('Invalid Google Credentials JSON.');
  }
}

// ---------------------------------------------------------------------------
// 1. APPLIED JOBS LOGGING & TRACKING
// ---------------------------------------------------------------------------

let inMemoryAppliedJobs: {
  timestamp: number;
  data: Array<{ company: string; title: string; platform: string; jobUrl: string; date: string; status: string }>;
  urlSet: Set<string>;
} | null = null;

export async function getAppliedJobs(
  forceRefresh = false,
  customConfig?: AppConfig
): Promise<Array<{ company: string; title: string; platform: string; jobUrl: string; date: string; status: string }>> {
  const config = customConfig || getConfig();
  if (!config.spreadsheetId || !config.googleCredentialsJson) {
    return inMemoryAppliedJobs ? inMemoryAppliedJobs.data : [];
  }

  const now = Date.now();
  // Return cached result if refreshed within the last 60 seconds unless forced
  if (!forceRefresh && inMemoryAppliedJobs && now - inMemoryAppliedJobs.timestamp < 60000) {
    return inMemoryAppliedJobs.data;
  }

  try {
    const sheets = getSheetsClient(config);
    const sheetTab = config.sheetName || 'Sheet1';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${sheetTab}!A2:F`, // A: Company, B: Title, C: Platform, D: Job URL, E: Date, F: Status
    });

    const rows = response.data.values || [];
    const data = rows.map((row) => ({
      company: row[0] || '',
      title: row[1] || '',
      platform: row[2] || '',
      jobUrl: row[3] || '',
      date: row[4] || '',
      status: row[5] || '',
    }));

    const urlSet = new Set<string>();
    data.forEach((j) => {
      const cleaned = cleanJobUrl(j.jobUrl);
      if (cleaned && !cleaned.endsWith('/viewjob') && !cleaned.endsWith('/jobs')) {
        urlSet.add(cleaned);
      }
    });

    inMemoryAppliedJobs = {
      timestamp: now,
      data,
      urlSet,
    };

    return data;
  } catch (error: any) {
    if (inMemoryAppliedJobs) {
      return inMemoryAppliedJobs.data;
    }
    if (error.message?.includes('Range') || error.status === 400) {
      await initializeSheet(config);
      return [];
    }
    console.error('Error fetching applied jobs (using local cache fallback):', error.message || error);
    return [];
  }
}

export function cleanJobUrl(url: string): string {
  if (!url) return '';
  try {
    const urlObj = new URL(url);

    // Indeed: Identifier unik pekerjaan berada pada query parameter 'jk' atau 'vjk'
    if (urlObj.hostname.includes('indeed.com')) {
      const jk = urlObj.searchParams.get('jk') || urlObj.searchParams.get('vjk');
      if (jk) {
        return `https://${urlObj.hostname}/viewjob?jk=${jk}`;
      }
      return url.trim();
    }

    // LinkedIn: Jika menggunakan URL search dengan query parameter currentJobId
    if (urlObj.hostname.includes('linkedin.com')) {
      const currentJobId = urlObj.searchParams.get('currentJobId');
      if (currentJobId) {
        return `https://www.linkedin.com/jobs/view/${currentJobId}`;
      }
      return `${urlObj.origin}${urlObj.pathname.replace(/\/+$/, '')}`;
    }

    // Platform lain (Glints, JobStreet): Pathname adalah identitas unik
    return `${urlObj.origin}${urlObj.pathname.replace(/\/+$/, '')}`;
  } catch (e) {
    return url.trim();
  }
}

export async function addAppliedJob(
  job: { company: string; title: string; platform: string; jobUrl: string; status: string },
  customConfig?: AppConfig
) {
  const config = customConfig || getConfig();
  const cleanedUrl = cleanJobUrl(job.jobUrl);
  const dateStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  // Update in-memory cache instantly
  if (inMemoryAppliedJobs) {
    if (cleanedUrl) inMemoryAppliedJobs.urlSet.add(cleanedUrl);
    inMemoryAppliedJobs.data.unshift({
      company: job.company,
      title: job.title,
      platform: job.platform,
      jobUrl: cleanedUrl,
      date: dateStr,
      status: job.status,
    });
  }

  if (!config.googleCredentialsJson || !config.spreadsheetId) return;

  try {
    const sheets = getSheetsClient(config);
    const sheetTab = config.sheetName || 'Sheet1';
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.spreadsheetId,
      range: `${sheetTab}!A2:F`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[job.company, job.title, job.platform, cleanedUrl, dateStr, job.status]],
      },
    });
  } catch (error: any) {
    console.error('Gagal mencatat lamaran ke Google Sheets (koneksi/credentials):', error.message || error);
  }
}

export async function isJobAlreadyApplied(jobUrl: string, customConfig?: AppConfig): Promise<boolean> {
  if (!jobUrl) return false;
  const targetUrl = cleanJobUrl(jobUrl);

  const cache = inMemoryAppliedJobs;
  if (cache) {
    return cache.urlSet.has(targetUrl);
  }

  const appliedJobs = await getAppliedJobs(false, customConfig);
  const freshCache = inMemoryAppliedJobs as { urlSet: Set<string> } | null;
  if (freshCache) {
    return freshCache.urlSet.has(targetUrl);
  }
  return appliedJobs.some((job) => cleanJobUrl(job.jobUrl) === targetUrl);
}

export async function initializeSheet(customConfig?: AppConfig) {
  const config = customConfig || getConfig();
  if (!config.googleCredentialsJson || !config.spreadsheetId) return;

  try {
    const sheets = getSheetsClient(config);
    const sheetTab = config.sheetName || 'Sheet1';
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range: `${sheetTab}!A1:F1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Company Name', 'Job Title', 'Platform', 'Job URL', 'Applied Date', 'Status']],
      },
    });
  } catch (error) {
    console.error('Failed to initialize Google Sheet headers:', error);
  }
}

export async function testSheetsConnection(
  customConfig?: AppConfig
): Promise<{ success: boolean; message?: string; error?: string }> {
  const config = customConfig || getConfig();
  if (!config.googleCredentialsJson || !config.spreadsheetId) {
    return {
      success: false,
      error: 'Google Credentials JSON atau Spreadsheet ID belum diatur di menu Pengaturan.'
    };
  }

  try {
    const sheets = getSheetsClient(config);
    const response = await sheets.spreadsheets.get({
      spreadsheetId: config.spreadsheetId,
    });

    // Auto-ensure both tabs exist on connection test
    try {
      await initializeSheet(config);
      await initializeQuestionsSheet(config);
    } catch {}

    return {
      success: true,
      message: `Terkoneksi ke Spreadsheet: "${response.data.properties?.title || config.spreadsheetId}"`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || String(error)
    };
  }
}

// ---------------------------------------------------------------------------
// 2. SCREENING QUESTIONS DATABASE (GOOGLE SHEETS KNOWLEDGE BASE)
// ---------------------------------------------------------------------------

let inMemoryQuestions: {
  timestamp: number;
  data: ScreeningQuestionItem[];
} | null = null;

export function invalidateQuestionsCache() {
  inMemoryQuestions = null;
}

export function getQuestionsSheetTabName(cfg?: AppConfig): string {
  const config = cfg || getConfig();
  return config.questionsSheetName || 'Screening Questions';
}

/**
 * Ensures the "Screening Questions" tab exists and has column headers.
 */
export async function initializeQuestionsSheet(customConfig?: AppConfig): Promise<boolean> {
  const config = customConfig || getConfig();
  if (!config.googleCredentialsJson || !config.spreadsheetId) return false;

  try {
    const sheets = getSheetsClient(config);
    const qTab = getQuestionsSheetTabName(config);

    // 1. Check existing sheets
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: config.spreadsheetId,
    });
    const sheetTitles = spreadsheet.data.sheets?.map(s => s.properties?.title) || [];

    // 2. Create tab if missing
    if (!sheetTitles.includes(qTab)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: config.spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: qTab,
                  gridProperties: { rowCount: 1000, columnCount: 10 }
                }
              }
            }
          ]
        }
      });
    }

    // 3. Set header row
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range: `${qTab}!A1:E1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Question', 'Type', 'Options', 'Answer', 'Updated At']],
      },
    });

    return true;
  } catch (err: any) {
    console.error('Failed to initialize Screening Questions sheet:', err.message || err);
    return false;
  }
}

/**
 * Fetches all screening questions from Google Sheets with in-memory caching.
 */
export async function getQuestionsFromSheet(
  forceRefresh = false,
  customConfig?: AppConfig
): Promise<ScreeningQuestionItem[]> {
  const config = customConfig || getConfig();
  if (!config.googleCredentialsJson || !config.spreadsheetId) {
    return inMemoryQuestions ? inMemoryQuestions.data : [];
  }

  const now = Date.now();
  if (!forceRefresh && inMemoryQuestions && now - inMemoryQuestions.timestamp < 60000) {
    return inMemoryQuestions.data;
  }

  try {
    const sheets = getSheetsClient(config);
    const qTab = getQuestionsSheetTabName(config);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${qTab}!A2:E`,
    });

    const rows = response.data.values || [];
    const questions: ScreeningQuestionItem[] = [];

    rows.forEach((row, index) => {
      const q = (row[0] || '').trim();
      if (!q) return;

      questions.push({
        id: `q-${index + 2}-${Math.random().toString(36).substring(2, 6)}`,
        question: q,
        type: (row[1] || 'radiobutton').trim(),
        options: (row[2] || '').trim(),
        answer: (row[3] || '').trim(),
        updatedAt: (row[4] || '').trim()
      });
    });

    // Auto-seed if sheet tab is completely empty
    if (questions.length === 0) {
      const seeded = await seedQuestionsFromCsvIfEmpty(config);
      if (seeded.length > 0) {
        return seeded;
      }
    }

    inMemoryQuestions = {
      timestamp: now,
      data: questions,
    };

    return questions;
  } catch (error: any) {
    if (error.message?.includes('Range') || error.status === 400 || error.message?.includes('not found')) {
      await initializeQuestionsSheet(config);
      return await seedQuestionsFromCsvIfEmpty(config);
    }
    console.error('Failed to get questions from Google Sheets:', error.message || error);
    return inMemoryQuestions ? inMemoryQuestions.data : [];
  }
}

/**
 * Appends a newly answered question row to Google Sheets knowledge base.
 */
export async function appendQuestionToSheet(
  question: string,
  type: string,
  options: string[],
  answers: string[],
  customConfig?: AppConfig
) {
  const config = customConfig || getConfig();
  if (!config.googleCredentialsJson || !config.spreadsheetId) return;

  const cleanQ = question.trim();
  if (!cleanQ) return;

  const normalizedNew = cleanQ.toLowerCase().replace(/[^a-z0-9]/g, '');
  const optionsStr = options.join(' | ');
  const answerStr = answers.join(' || ');
  const dateStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  // Update in-memory cache first
  if (inMemoryQuestions) {
    const isDup = inMemoryQuestions.data.some(
      item => item.question.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedNew
    );
    if (isDup) return; // Prevent duplicate

    inMemoryQuestions.data.unshift({
      id: `q-live-${Date.now()}`,
      question: cleanQ,
      type,
      options: optionsStr,
      answer: answerStr,
      updatedAt: dateStr
    });
  }

  try {
    const sheets = getSheetsClient(config);
    const qTab = getQuestionsSheetTabName(config);

    // Verify questions sheet is initialized
    await initializeQuestionsSheet(config);

    await sheets.spreadsheets.values.append({
      spreadsheetId: config.spreadsheetId,
      range: `${qTab}!A2:E`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[cleanQ, type, optionsStr, answerStr, dateStr]],
      },
    });
  } catch (err: any) {
    console.error('Failed to append question to Google Sheet:', err.message || err);
  }
}

/**
 * Overwrites / saves all questions in batch to Google Sheets.
 */
export async function saveAllQuestionsToSheet(
  questions: ScreeningQuestionItem[],
  customConfig?: AppConfig
): Promise<{ success: boolean; message: string; count: number }> {
  const config = customConfig || getConfig();
  if (!config.googleCredentialsJson || !config.spreadsheetId) {
    throw new Error('Google Credentials atau Spreadsheet ID belum diatur.');
  }

  const sheets = getSheetsClient(config);
  const qTab = getQuestionsSheetTabName(config);
  await initializeQuestionsSheet(config);

  const dateStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const rows = questions.map(q => [
    q.question,
    q.type || 'radiobutton',
    q.options || '',
    q.answer || '',
    q.updatedAt || dateStr
  ]);

  // Clear existing content from row 2 onwards
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: config.spreadsheetId,
      range: `${qTab}!A2:E10000`,
    });
  } catch {}

  // Write new rows
  if (rows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range: `${qTab}!A2:E${rows.length + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rows,
      },
    });
  }

  inMemoryQuestions = {
    timestamp: Date.now(),
    data: questions,
  };

  return {
    success: true,
    message: `Berhasil menyimpan ${questions.length} pertanyaan ke Google Sheets!`,
    count: questions.length
  };
}

/**
 * Deduplicates questions in Google Sheets based on normalized question text.
 */
export async function cleanQuestionsInSheet(
  customConfig?: AppConfig
): Promise<{ success: boolean; message: string; count: number }> {
  const config = customConfig || getConfig();
  const currentQuestions = await getQuestionsFromSheet(true, config);
  if (currentQuestions.length === 0) {
    return { success: true, message: 'Tidak ada pertanyaan untuk dibersihkan.', count: 0 };
  }

  const seen = new Set<string>();
  const uniqueQuestions: ScreeningQuestionItem[] = [];

  for (const item of currentQuestions) {
    const normalized = item.question.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    uniqueQuestions.push(item);
  }

  await saveAllQuestionsToSheet(uniqueQuestions, config);

  return {
    success: true,
    message: `Duplikat berhasil dibersihkan! ${uniqueQuestions.length} pertanyaan unik tersimpan di Google Sheets.`,
    count: uniqueQuestions.length
  };
}

/**
 * Seeds default screening questions from public/imploye-question.csv if sheet is empty.
 */
export async function seedQuestionsFromCsvIfEmpty(
  customConfig?: AppConfig
): Promise<ScreeningQuestionItem[]> {
  const config = customConfig || getConfig();
  if (!config.googleCredentialsJson || !config.spreadsheetId) return [];

  try {
    const csvPath = path.join(process.cwd(), 'public', 'imploye-question.csv');
    if (!fs.existsSync(csvPath)) return [];

    const content = fs.readFileSync(csvPath, 'utf8');
    if (!content.trim()) return [];

    const records: string[][] = parse(content, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
    });

    const questions: ScreeningQuestionItem[] = [];
    const dateStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

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

      if (question.trim() && answer.trim()) {
        questions.push({
          id: `seed-${i}`,
          question: question.trim(),
          type: type.trim() || 'radiobutton',
          options: options.trim(),
          answer: answer.trim(),
          updatedAt: dateStr
        });
      }
    }

    if (questions.length > 0) {
      await saveAllQuestionsToSheet(questions, config);
      console.log(`[GoogleSheets] Successfully seeded ${questions.length} screening questions to Google Sheets!`);
    }

    return questions;
  } catch (err: any) {
    console.error('Failed to seed questions from CSV:', err.message || err);
    return [];
  }
}

