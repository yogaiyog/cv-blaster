'use client';

import { useState, useEffect, useRef } from 'react';

interface AppConfig {
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
  enableLinkedin?: boolean;
  enableIndeed?: boolean;
  indeedNoJobTitleFilter?: boolean;
  debugTest: boolean;
  concurrency: number;
  useSystemChrome?: boolean;
  customChromePath?: string;
  noticePeriod?: string;
  // Candidate Profile fields
  fullName?: string;
  expectedSalary?: number;
  educationLevel?: string;
  gpa?: string;
  yearsOfExperience?: number;
  skills?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  phoneNumber?: string;
  domicile?: string;
  geminiApiKey?: string;
}

interface AppliedJob {
  company: string;
  title: string;
  platform: string;
  jobUrl: string;
  date: string;
  status: string;
}

interface QuestionItem {
  id: string;
  question: string;
  type: string;
  options: string;
  answer: string;
  updatedAt?: string;
}

const STORAGE_KEY = 'cv_blaster_config_v1';

const EMPTY_CONFIG: AppConfig = {
  spreadsheetId: '',
  sheetName: 'Sheet1',
  questionsSheetName: 'Screening Questions',
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

interface RoleTemplate {
  id: string;
  name: string;
  category: string;
  icon: string;
  badgeColor: string;
  searchKeywords: string;
  skills: string;
  educationLevel: string;
  yearsOfExperience: number;
  expectedSalary: number;
  highlightSkills: string[];
}

const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: 'fullstack',
    name: 'Fullstack Developer',
    category: 'Software Engineering & IT',
    icon: '💻',
    badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    searchKeywords: 'Fullstack Developer, Frontend Developer, Backend Developer, Software Engineer, Web Developer, React Developer, Node.js Developer',
    skills: "JavaScript, TypeScript, Python, Java, C#, C++, PHP, Go, HTML, CSS, React, React.js, Next.js, Angular, Angular.js, Vue.js, Tailwind CSS, Bootstrap, jQuery, Framer Motion, Three.js, Node.js, Express.js, NestJS, Fiber, Laravel, Django, FastAPI, Spring Boot, REST API, RESTful API, GraphQL, Redis, RabbitMQ, Kafka, Celery, Asynq, Message Queue, PostgreSQL, MySQL, Supabase, Prisma, MongoDB, SQL, Docker, Nginx, PM2, Git, GitHub, GitHub Actions, CI/CD, Postman, VS Code, Full Stack Development, Backend Development, Frontend Development, Web Development, API Development, Database Design, Microservices, Object-Oriented Programming, Asynchronous Programming, Agile, Scrum, Problem Solving, Debugging",
    educationLevel: 'Sarjana (S1)',
    yearsOfExperience: 2,
    expectedSalary: 10000000,
    highlightSkills: ['React & Next.js', 'Node.js & Go', 'PostgreSQL & SQL', 'Docker & CI/CD']
  },
  {
    id: 'finance',
    name: 'Finance & Accounting',
    category: 'Keuangan, Akuntansi & Pajak',
    icon: '📊',
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    searchKeywords: 'Finance, Accounting, Staf Keuangan, Finance Officer, Accounting Staff, Staf Pajak, Tax Specialist, Auditor, Financial Analyst, Treasury',
    skills: "Microsoft Excel, Advanced Excel, VLOOKUP, HLOOKUP, XLOOKUP, Pivot Table, INDEX MATCH, Financial Reporting, Laporan Keuangan, Laporan Laba Rugi, Neraca, Bookkeeping, Jurnal Umum, Jurnal Penyesuaian, Akuntansi, General Ledger, Buku Besar, Tax, Pajak, PPh 21, PPh 23, PPh 4 ayat 2, PPh 25, PPN, e-Faktur, e-SPT, DJP Online, Brevet A & B, Accurate, Accurate Online, Zahir Accounting, SAP, SAP ERP, MYOB, Jurnal by Mekari, Cash Flow Management, Manajemen Arus Kas, Budgeting, Anggaran, Financial Planning, Invoicing, Faktur, Petty Cash, Kas Kecil, Bank Reconciliation, Rekonsiliasi Bank, Audit Keuangan, Internal Audit, Cost Accounting, Akuntansi Biaya, Financial Modeling, Analytical Thinking, Problem Solving, Kepatuhan Pajak",
    educationLevel: 'Sarjana (S1)',
    yearsOfExperience: 2,
    expectedSalary: 7500000,
    highlightSkills: ['Excel (Pivot & VLOOKUP)', 'Pajak (PPh, PPN, e-Faktur)', 'Laporan Keuangan', 'Accurate & SAP']
  },
  {
    id: 'digital_marketing',
    name: 'Digital Marketing',
    category: 'Pemasaran, Ads & Social Media',
    icon: '📱',
    badgeColor: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
    searchKeywords: 'Digital Marketing, Performance Marketing, Social Media Specialist, SEO Specialist, Content Creator, Copywriter, SEM Specialist, Brand Marketing, Marketing Communication',
    skills: "Meta Ads, Facebook Ads, Instagram Ads, Google Ads, Google Search Ads, TikTok Ads, TikTok Shop, TikTok Affiliate, SEO, Search Engine Optimization, On-Page SEO, Off-Page SEO, Keyword Research, SEM, Google Analytics, GA4, Google Tag Manager, Google Search Console, Copywriting, Content Marketing, Content Writing, Content Strategy, Social Media Marketing, Social Media Management, Instagram Marketing, LinkedIn Marketing, Email Marketing, Mailchimp, CRM, Canva, CapCut, Adobe Photoshop, Adobe Premiere, Video Editing, Influencer Marketing, KOL Management, Market Research, Branding, A/B Testing, Conversion Rate Optimization (CRO), ROI & ROAS Optimization, Creative Campaign Strategy",
    educationLevel: 'Sarjana (S1)',
    yearsOfExperience: 2,
    expectedSalary: 8000000,
    highlightSkills: ['Meta & Google Ads', 'SEO & Google Analytics', 'Copywriting & Content', 'TikTok & Social Media']
  },
  {
    id: 'guru',
    name: 'Guru & Tenaga Pengajar',
    category: 'Pendidikan, Bimbel & Pelatihan',
    icon: '🎓',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    searchKeywords: 'Guru, Pengajar, Teacher, Tutor, Instruktur, Dosen, Tenaga Pendidik, Academic Coordinator, Education Specialist, Guru Bimbel',
    skills: "Kurikulum Merdeka, Kurikulum 2013 (K13), Rencana Pelaksanaan Pembelajaran (RPP), Modul Ajar, Silabus, Manajemen Kelas, Classroom Management, Metode Pembelajaran Interaktif, Active Learning, Pembuatan Soal, Asesmen Pembelajaran, Penilaian Siswa, Asesmen Diagnostik & Formatif, Microsoft PowerPoint, Canva for Education, Google Classroom, Google Workspace for Education, Zoom, Media Pembelajaran Digital, Bimbingan Konseling, Public Speaking, Komunikasi Efektif, Edukasi Anak, Pedagogik, Lesson Planning, Mentoring, Pembelajaran Daring & Luring, Evaluasi Pembelajaran, Student Engagement, Karakter Siswa",
    educationLevel: 'Sarjana (S1)',
    yearsOfExperience: 2,
    expectedSalary: 6000000,
    highlightSkills: ['Kurikulum Merdeka & RPP', 'Manajemen Kelas & Asesmen', 'Canva & Google Classroom', 'Pedagogik & Public Speaking']
  },
  {
    id: 'data_analyst',
    name: 'Data Analis',
    category: 'Data & Business Intelligence',
    icon: '📈',
    badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    searchKeywords: 'Data Analyst, Business Intelligence, BI Analyst, Data Scientist, Data Specialist, Junior Data Analyst, Analytics Specialist, Reporting Analyst',
    skills: "SQL, PostgreSQL, MySQL, Microsoft SQL Server, BigQuery, Snowflake, Python, Pandas, NumPy, Data Visualization, Visualisasi Data, Tableau, Power BI, Google Looker Studio, Metabase, Microsoft Excel, Advanced Excel, Pivot Tables, Power Query, Statistics, Statistika, Data Cleaning, Pembersihan Data, ETL, Data Wrangling, Business Intelligence, Dashboard Design, Business Reporting, A/B Testing, Exploratory Data Analysis (EDA), Data Modeling, Statistical Modeling, Analytical Thinking, Problem Solving, Storytelling with Data, KPI Tracking",
    educationLevel: 'Sarjana (S1)',
    yearsOfExperience: 2,
    expectedSalary: 9000000,
    highlightSkills: ['SQL & Relational DB', 'Tableau & Power BI', 'Python & Pandas', 'Excel & Business Intelligence']
  },
  {
    id: 'qa',
    name: 'QA (Quality Assurance)',
    category: 'Software Testing & Automation',
    icon: '🧪',
    badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    searchKeywords: 'QA Engineer, Quality Assurance, Software Tester, QA Tester, Manual Tester, Automation QA, Test Engineer, Software Quality Assurance',
    skills: "Manual Testing, Automation Testing, Pengujian Perangkat Lunak, Test Case Design, Desain Test Case, Test Scenarios, Test Plan, Bug Tracking, Pelaporan Bug, Jira, Trello, ClickUp, Postman, API Testing, REST API, Cypress, Selenium, Playwright, Appium, Mobile Testing, JMeter, Performance Testing, Regression Testing, Smoke Testing, Sanity Testing, Black Box Testing, White Box Testing, User Acceptance Testing (UAT), Git, CI/CD, TestRail, Zephyr, Agile, Scrum, SQL, Basic JavaScript/TypeScript, Problem Solving, Analytical Mindset",
    educationLevel: 'Sarjana (S1)',
    yearsOfExperience: 2,
    expectedSalary: 8500000,
    highlightSkills: ['Manual & Automation Testing', 'API Testing (Postman)', 'Cypress / Selenium / Playwright', 'Test Case Design & Jira']
  },
  {
    id: 'devops',
    name: 'DevOps & Cloud Engineer',
    category: 'Cloud, Infrastructure & CI/CD',
    icon: '⚡',
    badgeColor: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    searchKeywords: 'DevOps Engineer, Cloud Engineer, Site Reliability Engineer, SRE, System Administrator, Infrastructure Engineer, Platform Engineer',
    skills: "Linux, Ubuntu, Debian, CentOS, Bash Scripting, Shell Scripting, Docker, Docker Compose, Containerization, Kubernetes, K8s, Helm, CI/CD, CI/CD Pipelines, GitHub Actions, GitLab CI, Jenkins, AWS, Amazon Web Services, EC2, S3, RDS, Lambda, GCP, Google Cloud Platform, Microsoft Azure, Terraform, Infrastructure as Code (IaC), Ansible, Nginx, Reverse Proxy, Apache, Prometheus, Grafana, ELK Stack, Elasticsearch, Logstash, Kibana, Datadog, SSL/TLS, Let's Encrypt, Cloudflare, Git, Networking, DNS, TCP/IP, Security Best Practices, Microservices Architecture, Disaster Recovery",
    educationLevel: 'Sarjana (S1)',
    yearsOfExperience: 2,
    expectedSalary: 12000000,
    highlightSkills: ['Docker & Kubernetes', 'CI/CD (GitHub Actions)', 'AWS & Cloud Platform', 'Linux & Terraform']
  },
  {
    id: 'project_manager',
    name: 'Project Manager',
    category: 'Manajemen Proyek, Agile & Scrum',
    icon: '📋',
    badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    searchKeywords: 'Project Manager, PM, IT Project Manager, Scrum Master, Product Manager, Product Owner, Project Coordinator, Agile Project Manager',
    skills: "Project Management, Manajemen Proyek, Agile, Scrum, Kanban, Sprint Planning, Sprint Review, Daily Standup, Backlog Grooming, Sprint Retrospective, Jira, Jira Software, Confluence, Trello, ClickUp, Asana, Notion, Microsoft Project, Scope Management, Risk Management, Stakeholder Management, Budgeting, Anggaran Proyek, Resource Allocation, Timeline Management, Gantt Chart, Product Roadmap, User Stories, Acceptance Criteria, SDLC, Cross-functional Team Leadership, Problem Solving, Communication, Negotiation, Presentation, OKRs, KPIs, Vendor Management",
    educationLevel: 'Sarjana (S1)',
    yearsOfExperience: 3,
    expectedSalary: 11000000,
    highlightSkills: ['Agile & Scrum (Jira/Trello)', 'Sprint Planning & Roadmap', 'Stakeholder & Risk Management', 'Cross-functional Leadership']
  }
];

export default function Home() {
  // Config state
  const [config, setConfig] = useState<AppConfig>(EMPTY_CONFIG);

  // UI state
  const [activeTab, setActiveTab] = useState<'config' | 'profile' | 'questions' | 'logs' | 'history'>('config');
  const [logs, setLogs] = useState<string[]>([]);
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [isSetupBrowserRunning, setIsSetupBrowserRunning] = useState(false);
  const [appliedJobs, setAppliedJobs] = useState<AppliedJob[]>([]);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [sheetsWarning, setSheetsWarning] = useState<{
    open: boolean;
    error: string;
    mode: 'headless' | 'headful';
  } | null>(null);

  // Question Sheets state
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [questionsSource, setQuestionsSource] = useState<'google_sheets' | 'local_csv'>('local_csv');
  const [questionSearch, setQuestionSearch] = useState('');
  const [editingQuestion, setEditingQuestion] = useState<QuestionItem | null>(null);
  const [isNewQuestionModalOpen, setIsNewQuestionModalOpen] = useState(false);
  const [newQuestionData, setNewQuestionData] = useState<Omit<QuestionItem, 'id'>>({
    question: '',
    type: 'radiobutton',
    options: '',
    answer: ''
  });
  const [csvSaveStatus, setCsvSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importMode, setImportMode] = useState<'text' | 'file'>('text');
  const [importError, setImportError] = useState<string | null>(null);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [isSheetsTutorialOpen, setIsSheetsTutorialOpen] = useState(false);
  const [activeTutorialStep, setActiveTutorialStep] = useState(1);

  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateApplyOptions, setTemplateApplyOptions] = useState({
    skills: true,
    keywords: true,
    profile: false,
  });

  const handleApplyTemplate = (role: RoleTemplate) => {
    const updated = { ...config };
    if (templateApplyOptions.skills) {
      updated.skills = role.skills;
    }
    if (templateApplyOptions.keywords) {
      updated.searchKeywords = role.searchKeywords;
    }
    if (templateApplyOptions.profile) {
      updated.educationLevel = role.educationLevel;
      updated.yearsOfExperience = role.yearsOfExperience;
      updated.expectedSalary = role.expectedSalary;
    }
    setConfig(updated);
    setIsTemplateModalOpen(false);
    setSaveStatus({
      type: 'success',
      message: `✅ Template "${role.name}" berhasil diterapkan! Jangan lupa klik Simpan Konfigurasi / Profil.`
    });
  };

  const eventSourceRef = useRef<EventSource | null>(null);
  const logTerminalRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load config from server & localStorage on initial mount
  useEffect(() => {
    const initialize = async () => {
      let activeConfig = config;

      // 1. Fetch server config (has spreadsheetId & credentials if configured)
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          const serverCfg = data.config || data;
          if (serverCfg && typeof serverCfg === 'object') {
            activeConfig = { ...activeConfig, ...serverCfg };
          }
        }
      } catch {}

      // 2. Merge user's localStorage if available (without overwriting non-empty fields with empty ones)
      try {
        const savedLocal = localStorage.getItem(STORAGE_KEY);
        if (savedLocal) {
          const parsed = JSON.parse(savedLocal);
          for (const [k, v] of Object.entries(parsed)) {
            if (v !== '' && v !== null && v !== undefined) {
              (activeConfig as any)[k] = v;
            }
          }
        }
      } catch {}

      setConfig(activeConfig);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(activeConfig));
      } catch {}

      fetchQuestions(activeConfig);
      fetchAppliedHistory(activeConfig);
    };

    initialize();

    checkSetupBrowserStatus();
    const interval = setInterval(checkSetupBrowserStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Save to localStorage on any config modification
  useEffect(() => {
    try {
      if (config.spreadsheetId || config.googleCredentialsJson || config.searchKeywords) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      }
    } catch {}
  }, [config]);

  // Scroll terminal logs to bottom when new logs arrive
  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [logs]);

  const fetchQuestions = async (cfg?: AppConfig) => {
    const targetConfig = cfg || config;
    try {
      const queryParam = encodeURIComponent(JSON.stringify(targetConfig));
      const res = await fetch(`/api/questions?config=${queryParam}`);
      const data = await res.json();
      if (data.success) {
        setQuestions(data.questions || []);
        if (data.source) setQuestionsSource(data.source);
      }
    } catch (e) {
      console.error('Error loading questions', e);
    }
  };

  const handleSaveQuestionsList = async (updatedList: QuestionItem[]) => {
    setCsvSaveStatus(null);
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_all', questions: updatedList, config }),
      });
      const data = await res.json();
      if (data.success) {
        setQuestions(updatedList);
        setCsvSaveStatus({ type: 'success', message: 'Daftar pertanyaan berhasil disimpan!' });
        fetchQuestions();
      } else {
        setCsvSaveStatus({ type: 'error', message: data.error || 'Gagal menyimpan pertanyaan' });
      }
    } catch (e: any) {
      setCsvSaveStatus({ type: 'error', message: e.message || 'Gagal menyimpan pertanyaan' });
    }
  };


  const handleAddNewQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionData.question.trim()) return;

    const newItem: QuestionItem = {
      id: `q-${Date.now()}`,
      question: newQuestionData.question.trim(),
      type: newQuestionData.type,
      options: newQuestionData.options.trim(),
      answer: newQuestionData.answer.trim(),
    };

    const updated = [newItem, ...questions];
    await handleSaveQuestionsList(updated);
    setIsNewQuestionModalOpen(false);
    setNewQuestionData({ question: '', type: 'radiobutton', options: '', answer: '' });
  };

  const handleUpdateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;

    const updated = questions.map((q) => (q.id === editingQuestion.id ? editingQuestion : q));
    await handleSaveQuestionsList(updated);
    setEditingQuestion(null);
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus pertanyaan ini dari database?')) return;
    const updated = questions.filter((q) => q.id !== id);
    await handleSaveQuestionsList(updated);
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) return;
      const data = await res.json();
      const loadedConfig = data.config || data;
      if (loadedConfig && typeof loadedConfig === 'object') {
        setConfig((prev) => ({ ...prev, ...loadedConfig }));
      }
    } catch {
      // ignore
    }
  };

  const fetchAppliedHistory = async (cfg?: AppConfig) => {
    const targetConfig = cfg || config;
    try {
      const queryParam = encodeURIComponent(JSON.stringify(targetConfig));
      const res = await fetch(`/api/applied?config=${queryParam}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setAppliedJobs(data.data || []);
      }
    } catch {
      // ignore
    }
  };

  const checkSetupBrowserStatus = async () => {
    try {
      const res = await fetch('/api/setup-login');
      if (!res.ok) return;
      const data = await res.json();
      setIsSetupBrowserRunning(!!data.isRunning);
    } catch {
      // ignore
    }
  };

  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus(null);
    setIsSavingConfig(true);
    try {
      // 1. Save to LocalStorage immediately
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

      // 2. Sync with API endpoint
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus({ type: 'success', message: '✅ Konfigurasi tersimpan di LocalStorage & Server!' });
        setTimeout(() => setSaveStatus(null), 4000);
        fetchAppliedHistory(config);
        fetchQuestions(config);
      } else {
        setSaveStatus({ type: 'error', message: data.error || 'Gagal menyimpan konfigurasi' });
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', message: err.message || 'Terjadi kesalahan saat menyimpan' });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleExportConfig = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(config, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `cv-blaster-config-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const applyConfigJson = async (rawJson: string) => {
    setImportError(null);
    try {
      const parsed = JSON.parse(rawJson);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('JSON harus berupa objek konfigurasi yang valid.');
      }
      const merged = { ...config, ...parsed };
      setConfig(merged);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      setIsImportModalOpen(false);
      setImportJsonText('');
      alert('✅ Konfigurasi berhasil diimpor!');
      fetchAppliedHistory(merged);
      fetchQuestions(merged);
    } catch (err: any) {
      setImportError(err.message || 'Format JSON tidak valid.');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], 'UTF-8');
      fileReader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          applyConfigJson(content);
        }
      };
    }
  };

  const handleResetConfig = async () => {
    if (!confirm('Apakah Anda yakin ingin mengosongkan semua data konfigurasi dan profil (Reset ke awal onboarding)?')) {
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
      const cleanConfig: AppConfig = { ...EMPTY_CONFIG };
      setConfig(cleanConfig);
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanConfig),
      });
      alert('✅ Semua data konfigurasi dan profil berhasil dikosongkan!');
      fetchQuestions(cleanConfig);
      fetchAppliedHistory(cleanConfig);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  const handleToggleSetupBrowser = async () => {
    try {
      const action = isSetupBrowserRunning ? 'stop' : 'start';
      const res = await fetch('/api/setup-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setIsSetupBrowserRunning(!isSetupBrowserRunning);
        if (action === 'start') {
          alert('Browser dibuka! Silakan login manual ke Glints dan Jobstreet, kemudian biarkan profil tersimpan.');
        }
      } else {
        alert(data.error || 'Terjadi kesalahan saat memicu browser.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const executeStartBot = (mode: 'headless' | 'headful' = 'headless') => {
    if (isBotRunning) return;

    setLogs([`[${new Date().toLocaleTimeString()}] 🚀 Menghubungkan ke Bot Engine (${mode.toUpperCase()})...`]);
    setIsBotRunning(true);
    setActiveTab('logs');

    const configParam = encodeURIComponent(JSON.stringify(config));
    const eventSource = new EventSource(`/api/run-bot?mode=${mode}&config=${configParam}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLogs((prev) => [...prev, `[${new Date(data.timestamp).toLocaleTimeString()}] ${data.message}`]);
      } catch (e) {
        console.error('Failed to parse SSE event:', e);
      }
    };

    eventSource.onerror = () => {
      setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] 🔌 Connection closed.`]);
      setIsBotRunning(false);
      eventSource.close();
      fetchAppliedHistory(config);
    };
  };

  const handleStartBot = (mode: 'headless' | 'headful' = 'headless') => {
    if (isBotRunning) return;
    executeStartBot(mode);
  };

  const handleStopBot = async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsBotRunning(false);
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] 🛑 Stopping bot backend execution...`]);
    try {
      await fetch('/api/run-bot', { method: 'POST' });
    } catch (e) {
      console.error('Failed to send stop signal:', e);
    }
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] 🛑 Bot execution stopped manually.`]);
    fetchAppliedHistory(config);
  };

  const handleCleanCsv = async () => {
    try {
      const res = await fetch('/api/clean-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`🧼 ${data.message} (${data.count} pertanyaan unik tersimpan)`);
        fetchQuestions();
      } else {
        alert(`❌ Gagal membersihkan duplikat: ${data.error || data.message}`);
      }
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            CV Blaster Dashboard
          </span>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
            v1.0 (Glints, Jobstreet, LinkedIn, Indeed)
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Setup Browser Button */}
          <button
            onClick={handleToggleSetupBrowser}
            className={`px-4 py-2 rounded text-sm font-semibold transition ${
              isSetupBrowserRunning
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {isSetupBrowserRunning ? '🛑 Tutup Browser Setup' : '🔑 Buka Browser (Login Setup)'}
          </button>

          {/* Bot Control Button */}
          {isBotRunning ? (
            <button
              onClick={handleStopBot}
              className="px-5 py-2 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition"
            >
              Hentikan Bot
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => handleStartBot('headless')}
                disabled={isSetupBrowserRunning}
                className={`px-4 py-2 rounded font-semibold text-sm transition ${
                  isSetupBrowserRunning
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                🚀 Jalankan (Headless)
              </button>
              <button
                onClick={() => handleStartBot('headful')}
                disabled={isSetupBrowserRunning}
                className={`px-4 py-2 rounded font-semibold text-sm transition ${
                  isSetupBrowserRunning
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-700 text-white'
                }`}
              >
                👁️ Jalankan (Headful)
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-7xl mx-auto p-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab('config')}
            className={`px-5 py-3 font-medium text-sm transition border-b-2 ${
              activeTab === 'config'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚙️ Konfigurasi Bot
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-5 py-3 font-medium text-sm transition border-b-2 ${
              activeTab === 'profile'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            👤 Profil Pelamar
          </button>
          <button
            onClick={() => {
              setActiveTab('questions');
              fetchQuestions();
            }}
            className={`px-5 py-3 font-medium text-sm transition border-b-2 flex items-center gap-2 ${
              activeTab === 'questions'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📋 Database Pertanyaan (Google Sheets)
            {config.googleCredentialsJson && config.spreadsheetId && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                Cloud Sync
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-5 py-3 font-medium text-sm transition border-b-2 flex items-center gap-2 ${
              activeTab === 'logs'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📟 Live Logs
            {isBotRunning && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('history');
              fetchAppliedHistory();
            }}
            className={`px-5 py-3 font-medium text-sm transition border-b-2 ${
              activeTab === 'history'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📊 Riwayat Lamaran
          </button>
        </div>

        {/* Tab Contents */}
        <div className="bg-slate-950 rounded-lg border border-slate-800 p-6 shadow-xl">
          {/* TAB 1: CONFIGURATION */}
          {activeTab === 'config' && (
            <form onSubmit={handleSaveConfig} className="space-y-6">
              <h2 className="text-lg font-semibold text-slate-200 border-b border-slate-800 pb-2">
                Pilihan Platform (Toggles)
              </h2>
              <div className="flex gap-6 items-center py-2 flex-wrap">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enableGlints}
                    onChange={(e) => setConfig({ ...config, enableGlints: e.target.checked })}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-slate-300">Aktifkan Glints</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enableJobstreet}
                    onChange={(e) => setConfig({ ...config, enableJobstreet: e.target.checked })}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm font-medium text-slate-300">Aktifkan Jobstreet</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enableLinkedin}
                    onChange={(e) => setConfig({ ...config, enableLinkedin: e.target.checked })}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm font-medium text-slate-300">Aktifkan LinkedIn</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enableIndeed}
                    onChange={(e) => setConfig({ ...config, enableIndeed: e.target.checked })}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm font-medium text-slate-300">Aktifkan Indeed</span>
                </label>

                {/* Separator */}
                <div className="h-5 w-px bg-slate-800 hidden md:block"></div>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.debugTest}
                    onChange={(e) => setConfig({ ...config, debugTest: e.target.checked })}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-sm font-medium text-amber-400 font-bold">Debug Mode (Simulasi / Tanpa Submit)</span>
                </label>
              </div>

              <div className="flex justify-between items-center border-b border-slate-800 pb-2 flex-wrap gap-2">
                <h2 className="text-lg font-semibold text-slate-200">
                  Filter Pencarian Pekerjaan
                </h2>
                <label className="flex items-center gap-2 cursor-pointer bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-emerald-500/50 transition">
                  <input
                    type="checkbox"
                    checked={config.indeedNoJobTitleFilter || false}
                    onChange={(e) => setConfig({ ...config, indeedNoJobTitleFilter: e.target.checked })}
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-semibold text-emerald-400">
                    Indeed: Tanpa Filter Job Title (Cari Semua Loker)
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Kata Kunci Pekerjaan (Search Keywords)
                  </label>
                  <input
                    type="text"
                    required={!config.indeedNoJobTitleFilter}
                    placeholder="Contoh: React Developer, Node JS, Frontend"
                    value={config.searchKeywords}
                    onChange={(e) => setConfig({ ...config, searchKeywords: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Lokasi Kerja (Location)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Jakarta, Remote"
                    value={config.location}
                    onChange={(e) => setConfig({ ...config, location: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Worker Konkuren (Workers / Tabs)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={10}
                    value={config.concurrency}
                    onChange={(e) => setConfig({ ...config, concurrency: parseInt(e.target.value) || 3 })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Skema Limit Per Day / Per Platform */}
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">🎯 Pengaturan Kuota Limit Harian</h3>
                    <p className="text-xs text-slate-400">Pilih bagaimana kuota limit lamaran dibagi antar platform.</p>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-md border border-slate-800 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, limitMode: 'shared' })}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                        (config.limitMode || 'shared') === 'shared'
                          ? 'bg-blue-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🔵 Kuota Gabungan (Shared)
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, limitMode: 'per_platform' })}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                        config.limitMode === 'per_platform'
                          ? 'bg-purple-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🟣 Kuota Per-Platform
                    </button>
                  </div>
                </div>

                {(config.limitMode || 'shared') === 'shared' ? (
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="w-48">
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                          Total Limit Gabungan
                        </label>
                        <input
                          type="number"
                          required
                          min={1}
                          value={config.limitPerDay}
                          onChange={(e) => setConfig({ ...config, limitPerDay: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-bold"
                        />
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded p-3 text-xs text-slate-400">
                        💡 <b>Skema 1 Aktif:</b> Total akumulasi Glints + Jobstreet + LinkedIn + Indeed maksimal <b>{config.limitPerDay} lamaran</b> (bot akan otomatis berhenti jika total gabungan tercapai).
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
                        Limit Khusus Glints
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={config.limitGlints || 80}
                        onChange={(e) => setConfig({ ...config, limitGlints: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-bold"
                      />
                      <p className="text-xs text-slate-500 mt-1">Maksimal {config.limitGlints || 80} lowongan di Glints.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1">
                        Limit Khusus Jobstreet
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={config.limitJobstreet || 75}
                        onChange={(e) => setConfig({ ...config, limitJobstreet: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500 font-bold"
                      />
                      <p className="text-xs text-slate-500 mt-1">Maksimal {config.limitJobstreet || 75} lowongan di Jobstreet.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-sky-400 uppercase tracking-wider mb-1">
                        Limit Khusus LinkedIn
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={config.limitLinkedin || 50}
                        onChange={(e) => setConfig({ ...config, limitLinkedin: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-sky-500 font-bold"
                      />
                      <p className="text-xs text-slate-500 mt-1">Maksimal {config.limitLinkedin || 50} lowongan di LinkedIn.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
                        Limit Khusus Indeed
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={config.limitIndeed || 50}
                        onChange={(e) => setConfig({ ...config, limitIndeed: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 font-bold"
                      />
                      <p className="text-xs text-slate-500 mt-1">Maksimal {config.limitIndeed || 50} lowongan di Indeed.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Pengaturan Mesin Browser (Google Chrome / Fallback) */}
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">🌐 Mesin Browser & Anti-Bot</h3>
                    <p className="text-xs text-slate-400">Pilih browser untuk menjalankan bot dan setup login (disarankan Google Chrome Asli).</p>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-md border border-slate-800 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, useSystemChrome: true })}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                        config.useSystemChrome !== false
                          ? 'bg-emerald-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🟢 Google Chrome Asli (Auto-Fallback)
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, useSystemChrome: false })}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                        config.useSystemChrome === false
                          ? 'bg-amber-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🟡 Chromium Bawaan
                    </button>
                  </div>
                </div>

                {config.useSystemChrome !== false ? (
                  <div className="space-y-2 text-xs text-slate-300">
                    <p className="text-emerald-400 font-medium">
                      ✓ Prioritas 1: Membuka Google Chrome resmi sistem dengan proteksi anti-bot penuh (Widevine, real codecs).
                    </p>
                    <p className="text-slate-400">
                      ✓ Prioritas 2 (Fallback): Jika Google Chrome gagal terbuka, otomatis beralih ke Chromium bawaan dengan tetap mempertahankan sesi pada folder <code className="text-slate-300 bg-slate-950 px-1 py-0.5 rounded">automation-profile/</code>.
                    </p>
                    <div className="pt-2">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Custom Chrome Executable Path (Opsional - Kosongkan jika ingin auto-detect)
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh MacOS: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
                        value={config.customChromePath || ''}
                        onChange={(e) => setConfig({ ...config, customChromePath: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-amber-400">
                    ⚠️ Bot akan selalu dijalankan menggunakan engine Chromium bawaan Puppeteer.
                  </p>
                )}
              </div>

              {/* Integrasi Google Gemini AI */}
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <span>✨</span> Google Gemini AI (Smart Question Answering)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Digunakan bot untuk menjawab pertanyaan kuesioner lowongan yang belum ada di database secara otomatis &amp; cerdas.
                    </p>
                  </div>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium underline flex items-center gap-1 self-start sm:self-auto"
                  >
                    <span>Dapatkan API Key Gratis</span>
                    <span>↗</span>
                  </a>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Gemini API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showGeminiKey ? 'text' : 'password'}
                      placeholder="AIzaSy..."
                      value={config.geminiApiKey || ''}
                      onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 pr-28 text-slate-200 font-mono text-xs focus:outline-none focus:border-blue-500 tracking-wider"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1 font-medium"
                    >
                      <span>{showGeminiKey ? '🙈 Sembunyikan' : '👁️ Tampilkan'}</span>
                    </button>
                  </div>
                  <div className="flex items-start gap-2 text-[11px] text-slate-500 mt-2">
                    <span className="text-blue-400 font-bold">ℹ️</span>
                    <span>
                      Key disimpan secara lokal di komputer Anda. Anda bisa membuat Gemini API Key gratis tanpa kartu kredit di Google AI Studio.
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center border-b border-slate-800 pb-2 pt-4 flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-200">
                    Integrasi Google Sheets API (Cloud Database)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Digunakan untuk menyimpan log riwayat lamaran dan knowledge base pertanyaan kuisioner (tanpa butuh DB).
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleExportConfig}
                    className="px-3 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5 shadow-sm"
                    title="Unduh backup konfigurasi & profil ke file JSON"
                  >
                    📤 Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsImportModalOpen(true); setImportError(null); }}
                    className="px-3 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5 shadow-sm"
                    title="Impor konfigurasi dari teks atau file JSON"
                  >
                    📥 Import JSON
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Google Spreadsheet ID
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Masukkan ID Spreadsheet Anda"
                    value={config.spreadsheetId}
                    onChange={(e) => setConfig({ ...config, spreadsheetId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Tab Log Lamaran (Sheet Name)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Sheet1"
                    value={config.sheetName}
                    onChange={(e) => setConfig({ ...config, sheetName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Tab Database Pertanyaan
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Screening Questions"
                    value={config.questionsSheetName || 'Screening Questions'}
                    onChange={(e) => setConfig({ ...config, questionsSheetName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Google Credentials JSON (Service Account)
                </label>
                <textarea
                  rows={6}
                  required
                  placeholder="Paste isi file credentials.json di sini..."
                  value={config.googleCredentialsJson}
                  onChange={(e) => setConfig({ ...config, googleCredentialsJson: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 font-mono text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              {saveStatus && (
                <div
                  className={`p-3 rounded text-sm ${
                    saveStatus.type === 'success'
                      ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                      : 'bg-rose-950 border border-rose-800 text-rose-300'
                  }`}
                >
                  {saveStatus.message}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className={`font-semibold px-6 py-2.5 rounded transition flex items-center gap-2 ${
                    isSavingConfig
                      ? 'bg-blue-800 text-slate-300 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-blue-500/20'
                  }`}
                >
                  {isSavingConfig ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span>Menyimpan Konfigurasi...</span>
                    </>
                  ) : (
                    <span>💾 Simpan Konfigurasi</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleResetConfig}
                  className="font-medium px-4 py-2.5 rounded text-xs bg-slate-800 hover:bg-rose-900/60 hover:border-rose-700 text-slate-300 border border-slate-700 transition flex items-center gap-1.5"
                  title="Kosongkan semua form dan kembalikan ke kondisi onboarding baru"
                >
                  🔄 Reset ke Awal (Kosongkan Form)
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: CANDIDATE PROFILE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveConfig} className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-200 border-b border-slate-800 pb-2">
                  👤 Profil Pelamar (Dijadikan Referensi Jawaban Pertanyaan)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Data ini digunakan oleh bot &amp; AI untuk menjawab pertanyaan kuisioner Glints &amp; JobStreet secara otomatis.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Yoga Adi Saputra"
                    value={config.fullName || ''}
                    onChange={(e) => setConfig({ ...config, fullName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Gaji Bulanan yang Diharapkan (IDR)
                  </label>
                  <input
                    type="number"
                    placeholder="Contoh: 8000000"
                    value={config.expectedSalary || ''}
                    onChange={(e) => setConfig({ ...config, expectedSalary: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Nilai IPK / GPA
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 3.75"
                    value={config.gpa || ''}
                    onChange={(e) => setConfig({ ...config, gpa: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Jenjang Pendidikan Terakhir
                  </label>
                  <select
                    value={config.educationLevel || 'Sarjana (S1)'}
                    onChange={(e) => setConfig({ ...config, educationLevel: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="Sarjana (S1)">Sarjana (S1) / Bachelor Degree</option>
                    <option value="Diploma (D3)">Diploma (D3)</option>
                    <option value="Magister (S2)">Magister (S2) / Master Degree</option>
                    <option value="SMA/SMK">SMA / SMK</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Total Pengalaman Kerja (Tahun)
                  </label>
                  <input
                    type="number"
                    placeholder="Contoh: 3"
                    value={config.yearsOfExperience || 3}
                    onChange={(e) => setConfig({ ...config, yearsOfExperience: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Waktu Mulai Bekerja (Notice Period)
                  </label>
                  <select
                    value={config.noticePeriod || 'Immediately'}
                    onChange={(e) => setConfig({ ...config, noticePeriod: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="Immediately">Immediately / Secepatnya / ASAP (Default)</option>
                    <option value="2 weeks">2 Minggu (2 weeks)</option>
                    <option value="1 month">1 Bulan (1 month)</option>
                    <option value="2 months">2 Bulan (2 months)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Nomor Telepon / WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 081234567890"
                    value={config.phoneNumber || ''}
                    onChange={(e) => setConfig({ ...config, phoneNumber: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Link Portofolio / Website
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: https://github.com/yogaadi"
                    value={config.portfolioUrl || ''}
                    onChange={(e) => setConfig({ ...config, portfolioUrl: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Link GitHub
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: https://github.com/yogaadi"
                    value={config.githubUrl || ''}
                    onChange={(e) => setConfig({ ...config, githubUrl: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Link LinkedIn
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: https://www.linkedin.com/in/yoga-adi"
                    value={config.linkedinUrl || ''}
                    onChange={(e) => setConfig({ ...config, linkedinUrl: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Domisili / Lokasi Tempat Tinggal
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Jakarta Selatan, DKI Jakarta"
                    value={config.domicile || ''}
                    onChange={(e) => setConfig({ ...config, domicile: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Daftar Keahlian / Skills &amp; Tools (Pisahkan dengan koma)
                    </label>
                    <div className="group relative cursor-pointer">
                      <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-blue-900/60 text-blue-400 border border-blue-700/50">
                        ?
                      </span>
                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-80 p-3 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-300 shadow-xl z-50 pointer-events-none">
                        <p className="font-semibold text-blue-400 mb-1">💡 Cara Kerja Checklist Skills:</p>
                        <p className="leading-relaxed">Isi semua keahlian &amp; tools yang Anda pakai (bahasa pemrograman, framework, database, alat analisis data, devops, dll).</p>
                        <p className="mt-1.5 text-slate-400">• <strong className="text-purple-400">Jobstreet</strong>: Otomatis mencentang checkbox opsi yang cocok dengan daftar ini.</p>
                        <p className="text-slate-400">• <strong className="text-emerald-400">Glints</strong>: Otomatis memilih tingkat &quot;Ahli / Advanced&quot;.</p>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTemplateModalOpen(true)}
                    className="px-3 py-1.5 rounded text-xs font-semibold bg-blue-950/80 hover:bg-blue-900/80 text-blue-300 border border-blue-800/80 transition flex items-center gap-1.5 shadow-sm"
                    title="Pilih template profesi (Fullstack, Finance, Digital Marketing, Guru, Data Analis, QA, DevOps, Project Manager)"
                  >
                    <span>📋</span> Pilih Template Profesi
                  </button>
                </div>
                <textarea
                  rows={5}
                  placeholder="Contoh: JavaScript, TypeScript, React, Next.js, Node.js, Express, Go, PostgreSQL, MySQL, RESTful API, Docker, Git"
                  value={config.skills || ''}
                  onChange={(e) => setConfig({ ...config, skills: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 leading-relaxed font-mono"
                />
                <div className="mt-1.5 p-2.5 bg-slate-950/80 border border-slate-800 rounded-md flex items-start gap-2 text-xs text-slate-400">
                  <span className="text-blue-400 font-bold">ℹ️</span>
                  <span>
                    <strong>Tips Checklist:</strong> Bot mencocokkan pertanyaan kuesioner lowongan dengan daftar skill di atas. Semakin lengkap daftar skill &amp; tools yang Anda masukkan, semakin akurat bot mencentang opsi kuesioner kualifikasi secara otomatis.
                  </span>
                </div>
              </div>

              {saveStatus && (
                <div
                  className={`p-3 rounded text-sm ${
                    saveStatus.type === 'success'
                      ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                      : 'bg-rose-950 border border-rose-800 text-rose-300'
                  }`}
                >
                  {saveStatus.message}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className={`font-semibold px-6 py-2.5 rounded transition flex items-center gap-2 ${
                    isSavingConfig
                      ? 'bg-blue-800 text-slate-300 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-blue-500/20'
                  }`}
                >
                  {isSavingConfig ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span>Menyimpan Profil Pelamar...</span>
                    </>
                  ) : (
                    <span>💾 Simpan Profil Pelamar</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleResetConfig}
                  className="font-medium px-4 py-2.5 rounded text-xs bg-slate-800 hover:bg-rose-900/60 hover:border-rose-700 text-slate-300 border border-slate-700 transition flex items-center gap-1.5"
                  title="Kosongkan semua form dan kembalikan ke kondisi onboarding baru"
                >
                  🔄 Reset ke Awal (Kosongkan Form)
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: QUESTIONS GOOGLE SHEETS & CSV DATABASE */}
          {activeTab === 'questions' && (
            <div className="space-y-6">
              {/* Header & Controls */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-lg font-semibold text-slate-200">
                      📋 Knowledge Base Pertanyaan Kuisioner ({questions.length} Pertanyaan)
                    </h2>
                    {questionsSource === 'google_sheets' ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Google Sheets Active ({config.questionsSheetName || 'Screening Questions'})
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Google Sheets Belum Terhubung
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Knowledge base pertanyaan & jawaban kuisioner screening lowongan (Glints, Jobstreet, LinkedIn, Indeed).
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* Add New Question Button */}
                  <button
                    onClick={() => setIsNewQuestionModalOpen(true)}
                    className="px-3.5 py-1.5 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1.5"
                  >
                    ➕ Tambah Pertanyaan
                  </button>

                  {/* Clean Duplicate Questions Button */}
                  <button
                    onClick={handleCleanCsv}
                    className="px-3.5 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
                  >
                    🧼 Bersihkan Duplikat
                  </button>
                </div>
              </div>

              {/* Status Alert Banner */}
              {csvSaveStatus && (
                <div
                  className={`p-3 rounded text-sm ${
                    csvSaveStatus.type === 'success'
                      ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                      : 'bg-rose-950 border border-rose-800 text-rose-300'
                  }`}
                >
                  {csvSaveStatus.message}
                </div>
              )}

              {/* VISUAL TABLE */}
              <div className="space-y-4">
                  {/* Search bar */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="🔍 Cari pertanyaan, tipe, atau jawaban..."
                      value={questionSearch}
                      onChange={(e) => setQuestionSearch(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                    {questionSearch && (
                      <button
                        onClick={() => setQuestionSearch('')}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded transition"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  {/* Questions Table */}
                  <div className="overflow-x-auto rounded border border-slate-800">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-900/80 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                        <tr>
                          <th className="p-3 w-12 text-center">No</th>
                          <th className="p-3">Pertanyaan</th>
                          <th className="p-3 w-28">Tipe</th>
                          <th className="p-3">Pilihan Opsi</th>
                          <th className="p-3">Jawaban Bot</th>
                          <th className="p-3 w-24 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-normal">
                        {(() => {
                          const filtered = questions.filter((q) => {
                            if (!questionSearch.trim()) return true;
                            const term = questionSearch.toLowerCase();
                            return (
                              q.question.toLowerCase().includes(term) ||
                              q.answer.toLowerCase().includes(term) ||
                              q.type.toLowerCase().includes(term) ||
                              q.options.toLowerCase().includes(term)
                            );
                          });

                          if (filtered.length === 0) {
                            return (
                              <tr>
                                <td colSpan={6} className="p-8 text-center text-slate-500 italic">
                                  {questionSearch
                                    ? `Tidak ditemukan pertanyaan yang cocok dengan "${questionSearch}".`
                                    : 'Belum ada pertanyaan di database Google Sheets.'}
                                </td>
                              </tr>
                            );
                          }

                          return filtered.map((item, idx) => {
                            let typeBadge = 'bg-slate-800 text-slate-300 border-slate-700';
                            if (item.type === 'radiobutton') typeBadge = 'bg-blue-950 text-blue-300 border-blue-800';
                            if (item.type === 'checklist') typeBadge = 'bg-purple-950 text-purple-300 border-purple-800';
                            if (item.type === 'text') typeBadge = 'bg-emerald-950 text-emerald-300 border-emerald-800';
                            if (item.type === 'dropdown') typeBadge = 'bg-amber-950 text-amber-300 border-amber-800';

                            return (
                              <tr key={item.id} className="hover:bg-slate-900/40 transition">
                                <td className="p-3 text-center text-slate-500 text-xs font-mono">{idx + 1}</td>
                                <td className="p-3 font-medium text-slate-200">{item.question}</td>
                                <td className="p-3">
                                  <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${typeBadge}`}>
                                    {item.type || 'radiobutton'}
                                  </span>
                                </td>
                                <td className="p-3 text-xs text-slate-400 max-w-xs truncate" title={item.options}>
                                  {item.options || <span className="text-slate-600 italic">-</span>}
                                </td>
                                <td className="p-3">
                                  <span className="font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/60 text-xs">
                                    {item.answer}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => setEditingQuestion(item)}
                                      className="text-xs bg-slate-800 hover:bg-slate-700 text-blue-400 p-1.5 rounded transition"
                                      title="Edit Pertanyaan"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      onClick={() => handleDeleteQuestion(item.id)}
                                      className="text-xs bg-slate-800 hover:bg-slate-700 text-rose-400 p-1.5 rounded transition"
                                      title="Hapus Pertanyaan"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

              {/* MODAL: TAMBAH PERTANYAAN BARU */}
              {isNewQuestionModalOpen && (
                <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-fade-in">
                  <div className="bg-slate-950 border border-slate-800 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-2xl">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <h3 className="text-base font-semibold text-slate-100">➕ Tambah Pertanyaan Baru</h3>
                      <button
                        onClick={() => setIsNewQuestionModalOpen(false)}
                        className="text-slate-400 hover:text-slate-200 text-lg leading-none"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleAddNewQuestion} className="space-y-4 text-sm">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Pertanyaan</label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: What is your latest GPA?"
                          value={newQuestionData.question}
                          onChange={(e) => setNewQuestionData({ ...newQuestionData, question: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Tipe Input</label>
                          <select
                            value={newQuestionData.type}
                            onChange={(e) => setNewQuestionData({ ...newQuestionData, type: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                          >
                            <option value="radiobutton">Radiobutton (Pilihan Tunggal)</option>
                            <option value="text">Text / TextArea (Isian Bebas)</option>
                            <option value="checklist">Checklist (Pilihan Ganda)</option>
                            <option value="dropdown">Dropdown</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Jawaban Bot</label>
                          <input
                            type="text"
                            required
                            placeholder="Contoh: 3.75 atau Ahli"
                            value={newQuestionData.answer}
                            onChange={(e) => setNewQuestionData({ ...newQuestionData, answer: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-semibold text-emerald-400"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">
                          Pilihan Opsi (Pisahkan dengan tanda | )
                        </label>
                        <input
                          type="text"
                          placeholder="Contoh: Tidak Berpengalaman | Dasar | Menengah | Ahli"
                          value={newQuestionData.options}
                          onChange={(e) => setNewQuestionData({ ...newQuestionData, options: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">Kosongkan jika tipe input adalah Text / TextArea.</p>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setIsNewQuestionModalOpen(false)}
                          className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                        >
                          Simpan Pertanyaan
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* MODAL: EDIT PERTANYAAN */}
              {editingQuestion && (
                <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-fade-in">
                  <div className="bg-slate-950 border border-slate-800 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-2xl">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <h3 className="text-base font-semibold text-slate-100">✏️ Edit Pertanyaan &amp; Jawaban</h3>
                      <button
                        onClick={() => setEditingQuestion(null)}
                        className="text-slate-400 hover:text-slate-200 text-lg leading-none"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleUpdateQuestion} className="space-y-4 text-sm">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Pertanyaan</label>
                        <input
                          type="text"
                          required
                          value={editingQuestion.question}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, question: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Tipe Input</label>
                          <select
                            value={editingQuestion.type}
                            onChange={(e) => setEditingQuestion({ ...editingQuestion, type: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                          >
                            <option value="radiobutton">Radiobutton (Pilihan Tunggal)</option>
                            <option value="text">Text / TextArea (Isian Bebas)</option>
                            <option value="checklist">Checklist (Pilihan Ganda)</option>
                            <option value="dropdown">Dropdown</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Jawaban Bot</label>
                          <input
                            type="text"
                            required
                            value={editingQuestion.answer}
                            onChange={(e) => setEditingQuestion({ ...editingQuestion, answer: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-semibold text-emerald-400"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">
                          Pilihan Opsi (Pisahkan dengan tanda | )
                        </label>
                        <input
                          type="text"
                          value={editingQuestion.options}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, options: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setEditingQuestion(null)}
                          className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                        >
                          Simpan Perubahan
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LIVE LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Aktivitas Mesin Bot (Real-time):</span>
                <button
                  onClick={() => setLogs([])}
                  className="text-xs text-slate-500 hover:text-slate-300 transition"
                >
                  Clear logs
                </button>
              </div>
              <div
                ref={logTerminalRef}
                className="h-96 bg-slate-900 rounded border border-slate-800 p-4 font-mono text-sm overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800"
              >
                {logs.length === 0 ? (
                  <span className="text-slate-600 italic">Belum ada aktivitas. Silakan jalankan bot.</span>
                ) : (
                  logs.map((log, index) => {
                    let color = 'text-slate-300';
                    if (log.includes('✅')) color = 'text-emerald-400';
                    if (log.includes('❌') || log.includes('🚨')) color = 'text-rose-400';
                    if (log.includes('⚠️')) color = 'text-amber-400';
                    if (log.includes('🚀') || log.includes('🏁')) color = 'text-blue-400 font-bold';

                    return (
                      <div key={index} className={color}>
                        {log}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Riwayat Pekerjaan yang Dilamar (dari Google Sheets):</span>
                <button
                  onClick={() => fetchAppliedHistory()}
                  className="text-xs text-blue-400 hover:underline"
                >
                  🔄 Refresh Data
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Perusahaan</th>
                      <th className="py-3 px-4">Posisi</th>
                      <th className="py-3 px-4">Platform</th>
                      <th className="py-3 px-4">Tanggal</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Tautan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-sm">
                    {appliedJobs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-600 italic">
                          Belum ada riwayat lamaran yang tercatat di Google Sheet.
                        </td>
                      </tr>
                    ) : (
                      appliedJobs.map((job, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/50">
                          <td className="py-3 px-4 font-semibold text-slate-200">{job.company}</td>
                          <td className="py-3 px-4 text-slate-300">{job.title}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                job.platform === 'Glints'
                                  ? 'bg-blue-950 text-blue-400 border border-blue-900'
                                  : job.platform === 'Jobstreet'
                                  ? 'bg-purple-950 text-purple-400 border border-purple-900'
                                  : job.platform === 'LinkedIn'
                                  ? 'bg-sky-950 text-sky-400 border border-sky-900'
                                  : 'bg-emerald-950 text-emerald-400 border border-emerald-900'
                              }`}
                            >
                              {job.platform}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-400">{job.date}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                job.status === 'Success'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-900'
                                  : job.status === 'Already Applied'
                                  ? 'bg-amber-950 text-amber-400 border border-amber-900'
                                  : 'bg-rose-950 text-rose-400 border border-rose-900'
                              }`}
                            >
                              {job.status}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <a
                              href={job.jobUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-400 hover:underline text-xs"
                            >
                              Buka Detail 🔗
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* MODAL: IMPORT CONFIG (FILE OR TEXT) */}
        {isImportModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-slate-950 border border-slate-800 rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                    📥 Impor Konfigurasi (JSON)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pilih untuk copy-paste teks JSON langsung atau upload file .json
                  </p>
                </div>
                <button
                  onClick={() => { setIsImportModalOpen(false); setImportError(null); }}
                  className="text-slate-400 hover:text-slate-200 text-lg leading-none"
                >
                  ✕
                </button>
              </div>

              <div className="flex rounded-lg bg-slate-900 p-1 border border-slate-800 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => { setImportMode('text'); setImportError(null); }}
                  className={`flex-1 py-1.5 rounded-md transition ${importMode === 'text' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  📋 Copy-Paste Teks JSON
                </button>
                <button
                  type="button"
                  onClick={() => { setImportMode('file'); setImportError(null); }}
                  className={`flex-1 py-1.5 rounded-md transition ${importMode === 'file' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  📁 Upload File .JSON
                </button>
              </div>

              {importError && (
                <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-lg text-rose-300 text-xs">
                  ⚠️ {importError}
                </div>
              )}

              {importMode === 'text' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Paste teks JSON konfigurasi Anda di sini:
                  </label>
                  <textarea
                    rows={8}
                    value={importJsonText}
                    onChange={(e) => setImportJsonText(e.target.value)}
                    placeholder={'{\n  "spreadsheetId": "196J8Q5Vqey-NDXFF...",\n  "fullName": "Yoga Adi",\n  "expectedSalary": 8000000\n}'}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
                  />
                </div>
              ) : (
                <div
                  className="py-8 border-2 border-dashed border-slate-800 hover:border-blue-500/60 rounded-xl text-center cursor-pointer transition bg-slate-900/40 hover:bg-slate-900/70"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="text-3xl mb-2">📁</div>
                  <p className="text-sm font-semibold text-slate-200">Klik untuk memilih file konfigurasi .json</p>
                  <p className="text-xs text-slate-400 mt-1">Pilih file JSON hasil export sebelumnya</p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImportFile}
                    accept=".json"
                    className="hidden"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setIsImportModalOpen(false); setImportError(null); }}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                >
                  Batal
                </button>
                {importMode === 'text' && (
                  <button
                    type="button"
                    onClick={() => applyConfigJson(importJsonText)}
                    disabled={!importJsonText.trim()}
                    className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold shadow-md transition"
                  >
                    ✅ Terapkan Konfigurasi
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL: PILIH TEMPLATE PROFESI */}
        {isTemplateModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>📋</span> Pilih Template Profesi &amp; Keahlian
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pilih bidang pekerjaan Anda untuk mengisi daftar skill checklist kuesioner dan kata kunci pencarian otomatis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="text-slate-400 hover:text-slate-200 text-lg leading-none p-1.5 rounded-md hover:bg-slate-800 transition"
                >
                  ✕
                </button>
              </div>

              {/* Options Bar */}
              <div className="px-6 py-3 bg-slate-900/80 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-slate-300 font-semibold">Opsi Penerapan Template:</span>
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={templateApplyOptions.skills}
                      onChange={(e) => setTemplateApplyOptions({ ...templateApplyOptions, skills: e.target.checked })}
                      className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-950"
                    />
                    <span>Daftar Skill Checklist</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={templateApplyOptions.keywords}
                      onChange={(e) => setTemplateApplyOptions({ ...templateApplyOptions, keywords: e.target.checked })}
                      className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-950"
                    />
                    <span>Kata Kunci Pencarian (Keywords)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={templateApplyOptions.profile}
                      onChange={(e) => setTemplateApplyOptions({ ...templateApplyOptions, profile: e.target.checked })}
                      className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-950"
                    />
                    <span>Contoh Ekspektasi Gaji &amp; Pengalaman</span>
                  </label>
                </div>
              </div>

              {/* Grid of 8 Role Cards */}
              <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
                {ROLE_TEMPLATES.map((role) => (
                  <div
                    key={role.id}
                    className="p-4 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-xl transition flex flex-col justify-between group shadow-sm"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">{role.icon}</span>
                          <div>
                            <h4 className="text-sm font-bold text-slate-100 group-hover:text-blue-400 transition">
                              {role.name}
                            </h4>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium inline-block mt-0.5 ${role.badgeColor}`}>
                              {role.category}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Highlight Skills Badges */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {role.highlightSkills.map((badge, idx) => (
                          <span key={idx} className="text-[11px] bg-slate-950 text-slate-300 border border-slate-800 px-2 py-0.5 rounded-md">
                            {badge}
                          </span>
                        ))}
                      </div>

                      {/* Keywords Preview */}
                      <p className="mt-2.5 text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        <strong className="text-slate-300">Keywords:</strong> {role.searchKeywords}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">
                        {role.skills.split(',').length}+ keahlian &amp; tools
                      </span>
                      <button
                        type="button"
                        onClick={() => handleApplyTemplate(role)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md hover:shadow-blue-500/20 transition flex items-center gap-1.5"
                      >
                        <span>⚡ Terapkan Template</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center text-xs">
                <span className="text-slate-400">
                  💡 Anda dapat mengedit / menyesuaikan kembali daftar skill &amp; keyword setelah template diterapkan.
                </span>
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: TUTORIAL SETUP GOOGLE SHEETS */}
        {isSheetsTutorialOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>📖</span> Tutorial Setup Google Sheets (Cloud Database)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Panduan 5 langkah mudah menghubungkan Google Spreadsheet untuk log lamaran &amp; bank soal kuesioner.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSheetsTutorialOpen(false)}
                  className="text-slate-400 hover:text-slate-200 text-lg leading-none p-1.5 rounded-md hover:bg-slate-800 transition"
                >
                  ✕
                </button>
              </div>

              {/* Stepper Navigation */}
              <div className="px-6 py-3 bg-slate-900/80 border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-xs">
                {[
                  { num: 1, title: '1. Aktifkan API', icon: '☁️' },
                  { num: 2, title: '2. Service Account', icon: '🔑' },
                  { num: 3, title: '3. Buat Sheets & Share', icon: '📊' },
                  { num: 4, title: '4. Ambil ID', icon: '🆔' },
                  { num: 5, title: '5. Setup Tab', icon: '📑' },
                ].map((s) => (
                  <button
                    key={s.num}
                    type="button"
                    onClick={() => setActiveTutorialStep(s.num)}
                    className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
                      activeTutorialStep === s.num
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <span>{s.icon}</span>
                    <span>{s.title}</span>
                  </button>
                ))}
              </div>

              {/* Step Content */}
              <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed">
                {activeTutorialStep === 1 && (
                  <div className="space-y-3">
                    <div className="p-3 bg-blue-950/40 border border-blue-800/60 rounded-xl">
                      <h4 className="font-bold text-sm text-blue-300 mb-1 flex items-center gap-1.5">
                        <span>☁️</span> Langkah 1: Buat Project &amp; Aktifkan Google Sheets API
                      </h4>
                      <p className="text-slate-300">
                        Google Cloud Console adalah tempat membuat integrasi resmi gratis dengan Google Spreadsheet.
                      </p>
                    </div>

                    <ol className="list-decimal list-inside space-y-2.5 text-slate-300">
                      <li>
                        Buka{' '}
                        <a
                          href="https://console.cloud.google.com"
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 hover:underline font-semibold"
                        >
                          Google Cloud Console (console.cloud.google.com) ↗
                        </a>{' '}
                        dan login dengan akun Google Anda.
                      </li>
                      <li>
                        Klik dropdown project di kiri atas, lalu klik <strong>&quot;New Project&quot;</strong>.
                      </li>
                      <li>
                        Beri nama project (misal: <code className="bg-slate-900 px-1 py-0.5 rounded text-blue-300">cv-blaster-app</code>) lalu klik <strong>Create</strong>.
                      </li>
                      <li>
                        Buka menu samping kiri ☰ → <strong>APIs &amp; Services</strong> → <strong>Library</strong>.
                      </li>
                      <li>
                        Cari <strong>&quot;Google Sheets API&quot;</strong> pada kolom pencarian, klik hasil pencarian, lalu klik tombol biru <strong>&quot;Enable&quot;</strong>.
                      </li>
                    </ol>
                  </div>
                )}

                {activeTutorialStep === 2 && (
                  <div className="space-y-3">
                    <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl">
                      <h4 className="font-bold text-sm text-emerald-300 mb-1 flex items-center gap-1.5">
                        <span>🔑</span> Langkah 2: Buat Service Account &amp; Download credentials.json
                      </h4>
                      <p className="text-slate-300">
                        Service Account berfungsi seperti &quot;robot email&quot; yang diberi izin untuk menulis data riwayat lamaran ke spreadsheet Anda.
                      </p>
                    </div>

                    <ol className="list-decimal list-inside space-y-2.5 text-slate-300">
                      <li>
                        Buka menu samping kiri ☰ → <strong>IAM &amp; Admin</strong> → <strong>Service Accounts</strong>.
                      </li>
                      <li>
                        Klik tombol <strong>&quot;+ Create Service Account&quot;</strong> di bagian atas.
                      </li>
                      <li>
                        Isi nama (misal: <code className="bg-slate-900 px-1 py-0.5 rounded text-emerald-300">cv-blaster-bot</code>), lalu klik <strong>Create and Continue</strong> → klik <strong>Done</strong>.
                      </li>
                      <li>
                        Pada daftar service account, klik email service account yang baru saja dibuat.
                      </li>
                      <li>
                        Buka tab <strong>&quot;Keys&quot;</strong> di bagian atas → klik <strong>&quot;Add Key&quot;</strong> → pilih <strong>&quot;Create new key&quot;</strong>.
                      </li>
                      <li>
                        Pilih tipe key <strong>JSON</strong>, lalu klik <strong>Create</strong>. File <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">credentials.json</code> akan otomatis terunduh ke komputer Anda.
                      </li>
                      <li>
                        Buka file <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">.json</code> tersebut dengan TextEdit / Notepad / VSCode, <strong>copy seluruh teksnya</strong>, dan paste ke form <strong>Google Credentials JSON</strong> di CV Blaster.
                      </li>
                    </ol>
                  </div>
                )}

                {activeTutorialStep === 3 && (
                  <div className="space-y-3">
                    <div className="p-3 bg-purple-950/40 border border-purple-800/60 rounded-xl">
                      <h4 className="font-bold text-sm text-purple-300 mb-1 flex items-center gap-1.5">
                        <span>📊</span> Langkah 3: Buat Google Spreadsheet Baru &amp; Share Akses
                      </h4>
                      <p className="text-slate-300">
                        Spreadsheet Anda harus dibagikan ke email Service Account agar bot memiliki izin menulis log.
                      </p>
                    </div>

                    <ol className="list-decimal list-inside space-y-2.5 text-slate-300">
                      <li>
                        Buka file <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">.json</code> yang Anda download di Langkah 2, cari baris <code className="bg-slate-900 px-1.5 py-0.5 rounded text-sky-300 font-mono">&quot;client_email&quot;</code>.
                        <div className="mt-1.5 p-2 bg-slate-900 rounded font-mono text-[11px] text-slate-400">
                          Contoh: <span className="text-emerald-400">cv-blaster-bot@project-123.iam.gserviceaccount.com</span>
                        </div>
                      </li>
                      <li>
                        Buka{' '}
                        <a
                          href="https://sheets.new"
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 hover:underline font-semibold"
                        >
                          Google Sheets Baru (sheets.new) ↗
                        </a>{' '}
                        di browser Anda.
                      </li>
                      <li>
                        Beri judul spreadsheet Anda (misal: <strong>Riwayat CV Blaster</strong>).
                      </li>
                      <li>
                        Klik tombol <strong>&quot;Share&quot; (Bagikan)</strong> di pojok kanan atas spreadsheet.
                      </li>
                      <li>
                        Paste alamat email Service Account (<code className="bg-slate-900 px-1 py-0.5 rounded text-emerald-400">client_email</code>) ke kolom sharing.
                      </li>
                      <li>
                        Pastikan role akses dipilih <strong>&quot;Editor&quot;</strong>, hilangkan centang <em>Notify people</em>, lalu klik <strong>Send / Share</strong>.
                      </li>
                    </ol>
                  </div>
                )}

                {activeTutorialStep === 4 && (
                  <div className="space-y-3">
                    <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl">
                      <h4 className="font-bold text-sm text-amber-300 mb-1 flex items-center gap-1.5">
                        <span>🆔</span> Langkah 4: Ambil Google Spreadsheet ID
                      </h4>
                      <p className="text-slate-300">
                        Spreadsheet ID adalah kode unik di URL browser Google Sheets Anda.
                      </p>
                    </div>

                    <div className="space-y-2 text-slate-300">
                      <p>1. Perhatikan URL Google Spreadsheet yang sedang Anda buka di browser:</p>
                      <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg font-mono text-[11px] break-all">
                        https://docs.google.com/spreadsheets/d/<span className="bg-amber-500/20 text-amber-300 px-1 py-0.5 rounded font-bold border border-amber-500/40">1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms</span>/edit#gid=0
                      </div>
                      <p>
                        2. Salin kode karakter acak di antara <code className="bg-slate-900 px-1 py-0.5 rounded text-blue-300">/d/</code> dan <code className="bg-slate-900 px-1 py-0.5 rounded text-blue-300">/edit</code> (yang disorot kuning di atas).
                      </p>
                      <p>
                        3. Paste kode tersebut ke input <strong>Google Spreadsheet ID</strong> di tab Konfigurasi CV Blaster.
                      </p>
                    </div>
                  </div>
                )}

                {activeTutorialStep === 5 && (
                  <div className="space-y-3">
                    <div className="p-3 bg-indigo-950/40 border border-indigo-800/60 rounded-xl">
                      <h4 className="font-bold text-sm text-indigo-300 mb-1 flex items-center gap-1.5">
                        <span>📑</span> Langkah 5: Setup Nama Tab (Job Applied &amp; Question Bank)
                      </h4>
                      <p className="text-slate-300">
                        CV Blaster menggunakan 2 tab sheet terpisah untuk menyimpan data secara rapi.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Tab 1: Log Lamaran */}
                      <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-100 flex items-center gap-1">
                            <span>📌</span> Tab 1: Log Riwayat Lamaran
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 font-mono">
                            Default: Sheet1
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Menyimpan daftar perusahaan, posisi, platform, link loker, dan status lamaran yang sudah dikirim bot.
                        </p>
                        <div className="pt-1">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                            Header Kolom (Dibuat otomatis oleh bot):
                          </span>
                          <div className="p-2 bg-slate-950 rounded font-mono text-[10px] text-slate-300 break-all">
                            Timestamp | Company | Job Title | Platform | Job URL | Status
                          </div>
                        </div>
                      </div>

                      {/* Tab 2: Database Pertanyaan */}
                      <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-100 flex items-center gap-1">
                            <span>❓</span> Tab 2: Database Pertanyaan
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                            Default: Screening Questions
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Menyimpan knowledge base kuesioner pertanyaan kualifikasi dan jawaban bot.
                        </p>
                        <div className="pt-1">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                            Header Kolom:
                          </span>
                          <div className="p-2 bg-slate-950 rounded font-mono text-[10px] text-slate-300 break-all">
                            Question | Type | Options | Answer
                          </div>
                        </div>
                        <p className="text-[10px] text-emerald-400 mt-1">
                          ✨ <em>Tips: Cukup klik tombol <strong>&quot;Migrasikan ke Google Sheets&quot;</strong> di Tab Database Pertanyaan untuk membuat &amp; mengisi tab ini secara instan!</em>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={activeTutorialStep === 1}
                    onClick={() => setActiveTutorialStep(prev => Math.max(1, prev - 1))}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 font-medium transition"
                  >
                    ← Sebelumnya
                  </button>
                  <button
                    type="button"
                    disabled={activeTutorialStep === 5}
                    onClick={() => setActiveTutorialStep(prev => Math.min(5, prev + 1))}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition"
                  >
                    Selanjutnya →
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSheetsTutorialOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
                >
                  Tutup Panduan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Peringatan Google Sheets Tidak Terkoneksi */}
        {sheetsWarning?.open && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-slate-900 border border-amber-500/50 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3 text-amber-400">
                <span className="text-3xl">⚠️</span>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Peringatan: Google Sheets Tidak Terkoneksi</h3>
                  <p className="text-xs text-amber-400/90 font-medium">Sistem gagal menghubungi server spreadsheet</p>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Bot mendeteksi bahwa sistem tidak dapat terhubung ke Google Sheets saat ini. Jika dilanjutkan, bot akan tetap melamar loker seperti biasa, namun riwayat lamaran <strong>tidak akan tercatat ke Spreadsheet</strong>.
              </p>
              <div className="bg-slate-950 border border-slate-800 rounded p-3 text-xs font-mono text-rose-300 max-h-36 overflow-y-auto break-all">
                <span className="text-slate-500 block mb-1 font-semibold">Detail Log Error:</span>
                {sheetsWarning.error}
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setSheetsWarning(null)}
                  className="px-4 py-2 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  🛑 Batal & Periksa Koneksi
                </button>
                <button
                  onClick={() => executeStartBot(sheetsWarning.mode)}
                  className="px-4 py-2 rounded text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-lg transition"
                >
                  ⚡ Tetap Lanjutkan (Tanpa Sheets)
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
