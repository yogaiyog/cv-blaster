import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

export interface AppliedJob {
  company: string;
  title: string;
  platform: string;
  jobUrl: string;
  date: string;
  status: string;
  matchScore?: string;
  matchReason?: string;
  note?: string;
}

export interface ScreeningQuestionItem {
  id?: string;
  question: string;
  type: string;
  options: string;
  answer: string;
  updatedAt?: string;
}

export interface SyncResult {
  totalScraped: number;
  totalInStorage: number;
  matchedCount: number;
  updatedCount: number;
  details: Array<{
    company: string;
    title: string;
    oldStatus: string;
    newStatus: string;
    index: number;
  }>;
}

// ---------------------------------------------------------------------------
// DIRECTORY & FILE PATH RESOLVER
// ---------------------------------------------------------------------------

export function getDataDir(): string {
  const dir = process.env.APP_USER_DATA || path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.error('[Storage] Gagal membuat direktori data:', e);
    }
  }
  return dir;
}

export function getAppliedJobsFilePath(): string {
  return path.join(getDataDir(), 'applied-jobs.json');
}

export function getQuestionsFilePath(): string {
  return path.join(getDataDir(), 'screening-questions.json');
}

// ---------------------------------------------------------------------------
// ATOMIC WRITE HELPER
// ---------------------------------------------------------------------------

let writeLock = Promise.resolve();

async function safeWriteJsonFile(filePath: string, data: any): Promise<void> {
  writeLock = writeLock.then(async () => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`;
    const jsonString = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(tempPath, jsonString, 'utf8');
    await fs.promises.rename(tempPath, filePath);
  }).catch((err) => {
    console.error(`[Storage] Gagal menyimpan file ${filePath}:`, err);
  });

  return writeLock;
}

// ---------------------------------------------------------------------------
// URL CLEANER & NORMALIZATION
// ---------------------------------------------------------------------------

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

function cleanStringForMatching(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/^pt\b|\bpt\b|^cv\b|\bcv\b/gi, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// IN-MEMORY CACHE & APPLIED JOBS
// ---------------------------------------------------------------------------

let inMemoryAppliedJobs: {
  timestamp: number;
  data: AppliedJob[];
  urlSet: Set<string>;
} | null = null;

function loadAppliedJobsFromDiskSync(): AppliedJob[] {
  const filePath = getAppliedJobsFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[Storage] Gagal membaca applied-jobs.json:', err);
    return [];
  }
}

export async function getAppliedJobs(forceRefresh = false): Promise<AppliedJob[]> {
  const now = Date.now();
  if (!forceRefresh && inMemoryAppliedJobs && now - inMemoryAppliedJobs.timestamp < 30000) {
    return inMemoryAppliedJobs.data;
  }

  const jobs = loadAppliedJobsFromDiskSync();
  const urlSet = new Set<string>();

  jobs.forEach((j) => {
    // Jangan masukkan lowongan dengan status simulasi (Dry-run Sim) ke daftar already applied
    if (j.status === 'Dry-run Sim') return;

    const cleaned = cleanJobUrl(j.jobUrl);
    if (cleaned && !cleaned.endsWith('/viewjob') && !cleaned.endsWith('/jobs')) {
      urlSet.add(cleaned);
    }
  });

  inMemoryAppliedJobs = {
    timestamp: now,
    data: jobs,
    urlSet,
  };

  return jobs;
}

export async function isJobAlreadyApplied(jobUrl: string): Promise<boolean> {
  if (!jobUrl) return false;
  const targetUrl = cleanJobUrl(jobUrl);

  if (!inMemoryAppliedJobs) {
    await getAppliedJobs(false);
  }

  if (inMemoryAppliedJobs) {
    return inMemoryAppliedJobs.urlSet.has(targetUrl);
  }

  return false;
}

export async function addAppliedJob(job: {
  company: string;
  title: string;
  platform: string;
  jobUrl: string;
  status: string;
  matchScore?: string;
  matchReason?: string;
  note?: string;
}): Promise<void> {
  // Jangan catat ke penyimpanan jika merupakan simulasi / dry-run (Debug Mode)
  if (job.status === 'Dry-run Sim') {
    return;
  }

  const cleanedUrl = cleanJobUrl(job.jobUrl);
  const dateStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  const newEntry: AppliedJob = {
    company: job.company,
    title: job.title,
    platform: job.platform,
    jobUrl: cleanedUrl,
    date: dateStr,
    status: job.status || 'Applied',
    matchScore: job.matchScore || '',
    matchReason: job.matchReason || '',
    note: job.note || '',
  };

  // Pastikan cache in-memory terinisialisasi
  if (!inMemoryAppliedJobs) {
    await getAppliedJobs(false);
  }

  if (inMemoryAppliedJobs) {
    if (cleanedUrl) inMemoryAppliedJobs.urlSet.add(cleanedUrl);
    inMemoryAppliedJobs.data.unshift(newEntry);
    inMemoryAppliedJobs.timestamp = Date.now();
  }

  // Simpan secara asinkron ke file JSON lokal
  const filePath = getAppliedJobsFilePath();
  const allJobs = inMemoryAppliedJobs ? inMemoryAppliedJobs.data : [newEntry];
  await safeWriteJsonFile(filePath, allJobs);
}

// ---------------------------------------------------------------------------
// STATUS SYNC: GLINTS & JOBSTREET
// ---------------------------------------------------------------------------

export async function updateGlintsApplicationStatuses(
  glintsApps: Array<{
    company: string;
    title: string;
    status: string;
    jobId?: string;
    applicationId?: string;
    actionDate?: string;
    closedReason?: string;
  }>
): Promise<SyncResult> {
  const currentJobs = await getAppliedJobs(true);
  let totalGlintsInStorage = 0;
  let matchedCount = 0;
  let updatedCount = 0;

  const details: SyncResult['details'] = [];

  for (let i = 0; i < currentJobs.length; i++) {
    const job = currentJobs[i];
    if (!job.platform.toLowerCase().includes('glints')) continue;

    totalGlintsInStorage++;
    const normJobComp = cleanStringForMatching(job.company);
    const normJobTitle = cleanStringForMatching(job.title);

    const matchedApp = glintsApps.find((app) => {
      if (app.jobId && job.jobUrl.includes(app.jobId)) return true;
      const normAppComp = cleanStringForMatching(app.company);
      const normAppTitle = cleanStringForMatching(app.title);

      if (normJobComp && normAppComp) {
        const compMatch =
          normJobComp === normAppComp ||
          normJobComp.includes(normAppComp) ||
          normAppComp.includes(normJobComp);
        if (compMatch && normJobTitle && normAppTitle) {
          return (
            normJobTitle === normAppTitle ||
            normJobTitle.includes(normAppTitle) ||
            normAppTitle.includes(normJobTitle)
          );
        }
      }
      return false;
    });

    if (matchedApp) {
      matchedCount++;
      if (matchedApp.status && matchedApp.status !== job.status) {
        details.push({
          company: job.company,
          title: job.title,
          oldStatus: job.status,
          newStatus: matchedApp.status,
          index: i,
        });
        job.status = matchedApp.status;
        updatedCount++;
      }
    }
  }

  if (updatedCount > 0) {
    await safeWriteJsonFile(getAppliedJobsFilePath(), currentJobs);
    if (inMemoryAppliedJobs) {
      inMemoryAppliedJobs.data = currentJobs;
      inMemoryAppliedJobs.timestamp = Date.now();
    }
  }

  return {
    totalScraped: glintsApps.length,
    totalInStorage: totalGlintsInStorage,
    matchedCount,
    updatedCount,
    details,
  };
}

export async function updateJobstreetApplicationStatuses(
  jobstreetApps: Array<{
    company: string;
    title: string;
    status: string;
    jobId?: string;
  }>
): Promise<SyncResult> {
  const currentJobs = await getAppliedJobs(true);
  let totalJobstreetInStorage = 0;
  let matchedCount = 0;
  let updatedCount = 0;

  const details: SyncResult['details'] = [];

  for (let i = 0; i < currentJobs.length; i++) {
    const job = currentJobs[i];
    if (!job.platform.toLowerCase().includes('jobstreet')) continue;

    totalJobstreetInStorage++;
    const normJobComp = cleanStringForMatching(job.company);
    const normJobTitle = cleanStringForMatching(job.title);

    const matchedApp = jobstreetApps.find((app) => {
      if (app.jobId && job.jobUrl.includes(app.jobId)) return true;
      const normAppComp = cleanStringForMatching(app.company);
      const normAppTitle = cleanStringForMatching(app.title);

      if (normJobComp && normAppComp) {
        const compMatch =
          normJobComp === normAppComp ||
          normJobComp.includes(normAppComp) ||
          normAppComp.includes(normJobComp);
        if (compMatch && normJobTitle && normAppTitle) {
          return (
            normJobTitle === normAppTitle ||
            normJobTitle.includes(normAppTitle) ||
            normAppTitle.includes(normJobTitle)
          );
        }
      }
      return false;
    });

    if (matchedApp) {
      matchedCount++;
      if (matchedApp.status && matchedApp.status !== job.status) {
        details.push({
          company: job.company,
          title: job.title,
          oldStatus: job.status,
          newStatus: matchedApp.status,
          index: i,
        });
        job.status = matchedApp.status;
        updatedCount++;
      }
    }
  }

  if (updatedCount > 0) {
    await safeWriteJsonFile(getAppliedJobsFilePath(), currentJobs);
    if (inMemoryAppliedJobs) {
      inMemoryAppliedJobs.data = currentJobs;
      inMemoryAppliedJobs.timestamp = Date.now();
    }
  }

  return {
    totalScraped: jobstreetApps.length,
    totalInStorage: totalJobstreetInStorage,
    matchedCount,
    updatedCount,
    details,
  };
}

// ---------------------------------------------------------------------------
// SCREENING QUESTIONS LOCAL STORAGE
// ---------------------------------------------------------------------------

let inMemoryQuestions: {
  timestamp: number;
  data: ScreeningQuestionItem[];
} | null = null;

export function invalidateQuestionsCache(): void {
  inMemoryQuestions = null;
}

function loadQuestionsFromDiskSync(): ScreeningQuestionItem[] {
  const filePath = getQuestionsFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[Storage] Gagal membaca screening-questions.json:', err);
    return [];
  }
}

export async function seedQuestionsFromCsvIfEmpty(): Promise<ScreeningQuestionItem[]> {
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
          updatedAt: dateStr,
        });
      }
    }

    if (questions.length > 0) {
      await safeWriteJsonFile(getQuestionsFilePath(), questions);
      inMemoryQuestions = {
        timestamp: Date.now(),
        data: questions,
      };
      console.log(`[Storage] Berhasil mengimpor ${questions.length} pertanyaan default dari CSV ke local storage!`);
    }

    return questions;
  } catch (err) {
    console.error('[Storage] Gagal melakukan seeding pertanyaan dari CSV:', err);
    return [];
  }
}

export async function getQuestionsFromStorage(forceRefresh = false): Promise<ScreeningQuestionItem[]> {
  const now = Date.now();
  if (!forceRefresh && inMemoryQuestions && now - inMemoryQuestions.timestamp < 30000) {
    return inMemoryQuestions.data;
  }

  let questions = loadQuestionsFromDiskSync();

  // Jika file belum ada atau kosong, lakukan auto-seed dari imploye-question.csv
  if (questions.length === 0) {
    questions = await seedQuestionsFromCsvIfEmpty();
  }

  inMemoryQuestions = {
    timestamp: now,
    data: questions,
  };

  return questions;
}

export async function appendQuestionToStorage(
  question: string,
  type: string,
  options: string[],
  answers: string[]
): Promise<void> {
  const cleanQ = question.trim();
  if (!cleanQ) return;

  const normalizedNew = cleanQ.toLowerCase().replace(/[^a-z0-9]/g, '');
  const optionsStr = options.join(' | ');
  const answerStr = answers.join(' || ');
  const dateStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  const currentQuestions = await getQuestionsFromStorage(false);
  const isDup = currentQuestions.some(
    (item) => item.question.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedNew
  );
  if (isDup) return;

  const newItem: ScreeningQuestionItem = {
    id: `q-local-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    question: cleanQ,
    type: type || 'radiobutton',
    options: optionsStr,
    answer: answerStr,
    updatedAt: dateStr,
  };

  currentQuestions.unshift(newItem);
  inMemoryQuestions = {
    timestamp: Date.now(),
    data: currentQuestions,
  };

  await safeWriteJsonFile(getQuestionsFilePath(), currentQuestions);
}

export async function saveAllQuestionsToStorage(
  questions: ScreeningQuestionItem[]
): Promise<{ success: boolean; message: string; count: number }> {
  inMemoryQuestions = {
    timestamp: Date.now(),
    data: questions,
  };

  await safeWriteJsonFile(getQuestionsFilePath(), questions);

  return {
    success: true,
    message: `Berhasil menyimpan ${questions.length} pertanyaan ke storage lokal!`,
    count: questions.length,
  };
}

export async function cleanQuestionsInStorage(): Promise<{
  success: boolean;
  message: string;
  count: number;
}> {
  const currentQuestions = await getQuestionsFromStorage(true);
  const seen = new Set<string>();
  const uniqueQuestions: ScreeningQuestionItem[] = [];

  for (const item of currentQuestions) {
    const normalized = item.question.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    uniqueQuestions.push(item);
  }

  await saveAllQuestionsToStorage(uniqueQuestions);

  return {
    success: true,
    message: `Duplikat berhasil dibersihkan! ${uniqueQuestions.length} pertanyaan unik tersimpan di storage lokal.`,
    count: uniqueQuestions.length,
  };
}

// ---------------------------------------------------------------------------
// CSV EXPORT & IMPORT UTILITIES
// ---------------------------------------------------------------------------

function escapeCsvField(field: string): string {
  if (field === null || field === undefined) return '';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportAppliedJobsToCsv(): Promise<string> {
  const jobs = await getAppliedJobs(true);
  const headers = ['Perusahaan', 'Posisi', 'Platform', 'Link Lowongan', 'Tanggal Dilamar', 'Status', 'Match Score', 'Match Reason', 'Catatan'];

  const rows = jobs.map((j) => [
    escapeCsvField(j.company),
    escapeCsvField(j.title),
    escapeCsvField(j.platform),
    escapeCsvField(j.jobUrl),
    escapeCsvField(j.date),
    escapeCsvField(j.status),
    escapeCsvField(j.matchScore || ''),
    escapeCsvField(j.matchReason || ''),
    escapeCsvField(j.note || ''),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}

export async function importAppliedJobsFromCsv(
  csvContent: string
): Promise<{ importedCount: number; skippedCount: number; totalCount: number }> {
  if (!csvContent || !csvContent.trim()) {
    throw new Error('Konten CSV kosong.');
  }

  const records: string[][] = parse(csvContent, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  });

  if (records.length <= 1) {
    return { importedCount: 0, skippedCount: 0, totalCount: (await getAppliedJobs()).length };
  }

  const currentJobs = await getAppliedJobs(true);
  const existingUrls = new Set(currentJobs.map((j) => cleanJobUrl(j.jobUrl)).filter(Boolean));

  let importedCount = 0;
  let skippedCount = 0;

  // Lewati baris 0 (header)
  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    if (!row || row.length < 4) continue;

    const company = (row[0] || '').trim();
    const title = (row[1] || '').trim();
    const platform = (row[2] || '').trim() || 'Manual';
    const rawUrl = (row[3] || '').trim();
    const cleanedUrl = cleanJobUrl(rawUrl);
    const date = (row[4] || '').trim() || new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const status = (row[5] || '').trim() || 'Applied';
    const matchScore = (row[6] || '').trim();
    const matchReason = (row[7] || '').trim();
    const note = (row[8] || '').trim();

    if (!cleanedUrl || existingUrls.has(cleanedUrl)) {
      skippedCount++;
      continue;
    }

    existingUrls.add(cleanedUrl);
    currentJobs.push({
      company,
      title,
      platform,
      jobUrl: cleanedUrl,
      date,
      status,
      matchScore,
      matchReason,
      note,
    });
    importedCount++;
  }

  if (importedCount > 0) {
    await safeWriteJsonFile(getAppliedJobsFilePath(), currentJobs);
    if (inMemoryAppliedJobs) {
      inMemoryAppliedJobs.data = currentJobs;
      inMemoryAppliedJobs.timestamp = Date.now();
      currentJobs.forEach((j) => {
        const u = cleanJobUrl(j.jobUrl);
        if (u) inMemoryAppliedJobs!.urlSet.add(u);
      });
    }
  }

  return {
    importedCount,
    skippedCount,
    totalCount: currentJobs.length,
  };
}

export async function clearAllAppliedJobs(): Promise<void> {
  const filePath = getAppliedJobsFilePath();
  await safeWriteJsonFile(filePath, []);
  if (inMemoryAppliedJobs) {
    inMemoryAppliedJobs.data = [];
    inMemoryAppliedJobs.urlSet.clear();
    inMemoryAppliedJobs.timestamp = Date.now();
  }
}

export function getStorageInfo(): {
  dataDir: string;
  appliedJobsPath: string;
  questionsPath: string;
  appliedJobsCount: number;
  questionsCount: number;
} {
  const applied = loadAppliedJobsFromDiskSync();
  const questions = loadQuestionsFromDiskSync();
  return {
    dataDir: getDataDir(),
    appliedJobsPath: getAppliedJobsFilePath(),
    questionsPath: getQuestionsFilePath(),
    appliedJobsCount: applied.length,
    questionsCount: questions.length,
  };
}
