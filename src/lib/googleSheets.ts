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

export async function getAppliedJobs(): Promise<Array<{ company: string; title: string; platform: string; jobUrl: string; date: string; status: string }>> {
  const config = getConfig();
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${config.sheetName}!A2:F`, // A: Company, B: Title, C: Platform, D: Job URL, E: Date, F: Status
    });

    const rows = response.data.values || [];
    return rows.map((row) => ({
      company: row[0] || '',
      title: row[1] || '',
      platform: row[2] || '',
      jobUrl: row[3] || '',
      date: row[4] || '',
      status: row[5] || '',
    }));
  } catch (error: any) {
    // If the sheet doesn't exist or is empty/header not set, we'll try to initialize it.
    if (error.message?.includes('Range') || error.status === 400) {
      await initializeSheet();
      return [];
    }
    console.error('Error fetching applied jobs:', error);
    return [];
  }
}

export function cleanJobUrl(url: string): string {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    return `${urlObj.origin}${urlObj.pathname}`;
  } catch (e) {
    return url;
  }
}

export async function addAppliedJob(job: { company: string; title: string; platform: string; jobUrl: string; status: string }) {
  const config = getConfig();
  const sheets = getSheetsClient();
  const dateStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const cleanedUrl = cleanJobUrl(job.jobUrl);

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A2:F`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[job.company, job.title, job.platform, cleanedUrl, dateStr, job.status]],
    },
  });
}

export async function isJobAlreadyApplied(jobUrl: string): Promise<boolean> {
  if (!jobUrl) return false;
  const targetUrl = cleanJobUrl(jobUrl);
  const appliedJobs = await getAppliedJobs();
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
