import fs from 'fs';
import path from 'path';

export interface AppConfig {
  spreadsheetId: string;
  sheetName: string;
  questionsSheetName?: string;
  googleCredentialsJson: string;
  searchKeywords: string;
  location: string;
  minSalary: string;
  limitPerDay: number;
  limitMode?: 'shared' | 'per_platform';
  limitGlints?: number;
  limitJobstreet?: number;
  limitLinkedin?: number;
  limitIndeed?: number;
  enableGlints: boolean;
  enableJobstreet: boolean;
  enableLinkedin: boolean;
  enableIndeed: boolean;
  indeedNoJobTitleFilter?: boolean;
  debugTest: boolean;
  concurrency: number;
  useSystemChrome?: boolean;
  customChromePath?: string;
  noticePeriod: string;
  // Candidate Profile Fields
  fullName: string;
  expectedSalary: number;
  educationLevel: string;
  gpa: string;
  yearsOfExperience: number;
  skills: string;
  portfolioUrl: string;
  githubUrl: string;
  linkedinUrl: string;
  phoneNumber: string;
  domicile: string;
  geminiApiKey?: string;
}

const CONFIG_DIR = process.env.APP_USER_DATA || process.cwd();
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export const DEFAULT_CONFIG: AppConfig = {
  spreadsheetId: '',
  sheetName: 'Sheet1',
  questionsSheetName: 'Sheet2',
  googleCredentialsJson: '',
  geminiApiKey: '',
  searchKeywords: '',
  location: '',
  minSalary: '',
  limitPerDay: 50,
  limitMode: 'shared',
  limitGlints: 20,
  limitJobstreet: 20,
  limitLinkedin: 20,
  limitIndeed: 20,
  enableGlints: true,
  enableJobstreet: true,
  enableLinkedin: true,
  enableIndeed: true,
  indeedNoJobTitleFilter: false,
  debugTest: false,
  concurrency: 2,
  useSystemChrome: true,
  customChromePath: '',
  noticePeriod: 'Immediately',
  fullName: '',
  expectedSalary: 0,
  educationLevel: 'Sarjana (S1)',
  gpa: '',
  yearsOfExperience: 0,
  skills: '',
  portfolioUrl: '',
  githubUrl: '',
  linkedinUrl: '',
  phoneNumber: '',
  domicile: '',
};

// In-memory runtime fallback for serverless environments
let memoryConfig: AppConfig | null = null;

export function getConfig(override?: Partial<AppConfig>): AppConfig {
  let base = DEFAULT_CONFIG;

  if (memoryConfig) {
    base = memoryConfig;
  } else {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const data = fs.readFileSync(CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(data);
        const resolved: AppConfig = { ...DEFAULT_CONFIG, ...parsed };
        memoryConfig = resolved;
        base = resolved;
      }
    } catch {
      // Readonly / serverless environment fallback
    }
  }

  if (override && Object.keys(override).length > 0) {
    const merged = { ...base };
    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined && value !== null && value !== '') {
        (merged as any)[key] = value;
      }
    }
    return merged;
  }

  return base;
}

export function saveConfig(config: Partial<AppConfig>): AppConfig {
  const current = getConfig();
  const updated = { ...current, ...config };
  memoryConfig = updated;

  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
  } catch (error) {
    // In serverless / read-only environments, writing to disk fails silently while memoryConfig holds the state
    console.warn('Filesystem is read-only (serverless mode). Config saved in memory.');
  }

  return updated;
}
