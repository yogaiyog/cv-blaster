import { google } from 'googleapis';
import { getConfig } from './config';

function getSheetsClient() {
  const config = getConfig();
  if (!config.googleCredentialsJson) {
    throw new Error('Google Credentials JSON are not configured.');
  }
  if (!config.spreadsheetId) {
    throw new Error('Spreadsheet ID is not configured.');
  }

  try {
    const credentials = JSON.parse(config.googleCredentialsJson);
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    return google.sheets({ version: 'v4', auth });
  } catch (error) {
    console.error('Failed to initialize Google Sheets client:', error);
    throw new Error('Invalid Google Credentials JSON.');
  }
}

let inMemoryAppliedJobs: {
  timestamp: number;
  data: Array<{ company: string; title: string; platform: string; jobUrl: string; date: string; status: string }>;
  urlSet: Set<string>;
} | null = null;

export async function getAppliedJobs(forceRefresh = false): Promise<Array<{ company: string; title: string; platform: string; jobUrl: string; date: string; status: string }>> {
  const config = getConfig();
  if (!config.spreadsheetId || !config.googleCredentialsJson) {
    return inMemoryAppliedJobs ? inMemoryAppliedJobs.data : [];
  }

  const now = Date.now();
  // Return cached result if refreshed within the last 60 seconds unless forced
  if (!forceRefresh && inMemoryAppliedJobs && now - inMemoryAppliedJobs.timestamp < 60000) {
    return inMemoryAppliedJobs.data;
  }

  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${config.sheetName}!A2:F`, // A: Company, B: Title, C: Platform, D: Job URL, E: Date, F: Status
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
      // Hindari memasukkan URL generik tanpa ID unik (misal hanya https://id.indeed.com/viewjob)
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
    // If rate limited (429) or network issue, fallback to existing in-memory cache gracefully
    if (inMemoryAppliedJobs) {
      return inMemoryAppliedJobs.data;
    }
    if (error.message?.includes('Range') || error.status === 400) {
      await initializeSheet();
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

export async function addAppliedJob(job: { company: string; title: string; platform: string; jobUrl: string; status: string }) {
  const config = getConfig();
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
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.spreadsheetId,
      range: `${config.sheetName}!A2:F`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[job.company, job.title, job.platform, cleanedUrl, dateStr, job.status]],
      },
    });
  } catch (error: any) {
    console.error('Gagal mencatat lamaran ke Google Sheets (koneksi/credentials):', error.message || error);
  }
}

export async function isJobAlreadyApplied(jobUrl: string): Promise<boolean> {
  if (!jobUrl) return false;
  const targetUrl = cleanJobUrl(jobUrl);

  // Fast path: Check in-memory URL set in 0.001ms
  const cache = inMemoryAppliedJobs;
  if (cache) {
    return cache.urlSet.has(targetUrl);
  }

  // First time: fetch & cache from Google Sheets
  const appliedJobs = await getAppliedJobs();
  const freshCache = inMemoryAppliedJobs as { urlSet: Set<string> } | null;
  if (freshCache) {
    return freshCache.urlSet.has(targetUrl);
  }
  return appliedJobs.some((job) => cleanJobUrl(job.jobUrl) === targetUrl);
}

export async function initializeSheet() {
  const config = getConfig();
  const sheets = getSheetsClient();

  try {
    // Check if sheet exists, if not we create headers
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range: `${config.sheetName}!A1:F1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Company Name', 'Job Title', 'Platform', 'Job URL', 'Applied Date', 'Status']],
      },
    });
  } catch (error) {
    console.error('Failed to initialize Google Sheet headers:', error);
  }
}

export async function testSheetsConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
  const config = getConfig();
  if (!config.googleCredentialsJson || !config.spreadsheetId) {
    return {
      success: false,
      error: 'Google Credentials JSON atau Spreadsheet ID belum diatur di menu Pengaturan.'
    };
  }

  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.get({
      spreadsheetId: config.spreadsheetId,
    });
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
