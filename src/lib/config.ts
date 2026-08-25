import fs from 'fs';
import path from 'path';

export interface AppConfig {
  spreadsheetId: string;
  sheetName: string;
  googleCredentialsJson: string;
  searchKeywords: string;
  location: string;
  minSalary: string;
  limitPerDay: number;
  enableGlints: boolean;
  enableJobstreet: boolean;
  debugTest: boolean;
  concurrency: number;
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
}

const CONFIG_PATH = path.join(process.cwd(), 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  spreadsheetId: '',
  sheetName: 'Sheet1',
  googleCredentialsJson: '',
  searchKeywords: '',
  location: '',
  minSalary: '',
  limitPerDay: 20,
  enableGlints: true,
  enableJobstreet: true,
  debugTest: true,
  concurrency: 3,
  noticePeriod: 'Immediately',
  fullName: 'Yoga Adi Saputra',
  expectedSalary: 8000000,
  educationLevel: 'Sarjana (S1)',
  gpa: '3.75',
  yearsOfExperience: 3,
  skills: 'JavaScript, TypeScript, React, React.js, Next.js, Node.js, Express.js, Go, Golang, HTML, HTML5, CSS, CSS3, Tailwind CSS, PostgreSQL, MySQL, RESTful API, Docker, Git',
  portfolioUrl: 'https://github.com/yogaadi',
  githubUrl: 'https://github.com/yogaadi',
  linkedinUrl: 'https://www.linkedin.com',
  phoneNumber: '081234567890',
  domicile: 'Jakarta Selatan, DKI Jakarta',
};

export function getConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('Error reading config:', error);
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(config: Partial<AppConfig>): AppConfig {
  try {
    const current = getConfig();
    const updated = { ...current, ...config };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  } catch (error) {
    console.error('Error writing config:', error);
    throw new Error('Failed to save configuration');
  }
}
