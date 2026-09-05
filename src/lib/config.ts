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
}

const CONFIG_PATH = path.join(process.cwd(), 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  spreadsheetId: '',
  sheetName: 'Sheet1',
  googleCredentialsJson: '',
  searchKeywords: '',
  location: '',
  minSalary: '',
  limitPerDay: 200,
  limitMode: 'shared',
  limitGlints: 80,
  limitJobstreet: 75,
  limitLinkedin: 50,
  limitIndeed: 50,
  enableGlints: true,
  enableJobstreet: true,
  enableLinkedin: true,
  enableIndeed: true,
  indeedNoJobTitleFilter: false,
  debugTest: true,
  concurrency: 3,
  useSystemChrome: true,
  customChromePath: '',
  noticePeriod: 'Immediately',
  fullName: 'Yoga Adi Saputra',
  expectedSalary: 8000000,
  educationLevel: 'Sarjana (S1)',
  gpa: '3.75',
  yearsOfExperience: 3,
  skills: 'JavaScript, TypeScript, Python, Java, C#, C++, PHP, Go, HTML, CSS, React, React.js, Next.js, Angular, Angular.js, Tailwind CSS, Bootstrap, jQuery, Framer Motion, Three.js, React Three Fiber, Drei, Node.js, Express.js, Fiber, GORM, REST API, RESTful API, Redis, RabbitMQ, Celery, Asynq, Message Queue, Kafka, PostgreSQL, MySQL, Supabase, Prisma, SQL, Docker, Nginx, PM2, Git, GitHub, GitHub Actions, Cloudflare, Let\'s Encrypt, Certbot, CI/CD, Postman, VS Code, Full Stack Development, Backend Development, Frontend Development, Web Development, API Development, Database Design, Microservices, Object-Oriented Programming, Asynchronous Programming, Blender, TouchDesigner, MediaPipe, Figma, ClickUp, Jira, Trello, Slack, Notion, Agile, Scrum, Problem Solving, Debugging',
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
