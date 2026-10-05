'use client';

import { useState, useEffect, useRef } from 'react';

interface AppConfig {
  spreadsheetId?: string;
  sheetName?: string;
  questionsSheetName?: string;
  googleCredentialsJson?: string;
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
  syncGlintsStatus?: boolean;
  syncJobstreetStatus?: boolean;
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
  matchScore?: string;
  matchReason?: string;
  note?: string;
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
  enableIndeed: false,
  syncGlintsStatus: false,
  syncJobstreetStatus: false,
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
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
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
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
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
    badgeColor: 'bg-pink-50 text-pink-700 border-pink-200',
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
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
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
    badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200',
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
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
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
    badgeColor: 'bg-orange-50 text-orange-700 border-orange-200',
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
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
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

  // Question Local Storage state
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [questionsSource, setQuestionsSource] = useState<'local_storage'>('local_storage');
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
      message: `Template "${role.name}" berhasil diterapkan.`
    });
  };

  const eventSourceRef = useRef<EventSource | null>(null);
  const logTerminalRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load config from server & localStorage on initial mount
  useEffect(() => {
    const initialize = async () => {
      let activeConfig = config;

      // 1. Fetch server config
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

      activeConfig.enableIndeed = false;
      setConfig(activeConfig);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(activeConfig));
      } catch {}

      fetchQuestions();
      fetchAppliedHistory();
    };

    initialize();

    checkSetupBrowserStatus();
    const interval = setInterval(checkSetupBrowserStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Save to localStorage on any config modification
  useEffect(() => {
    try {
      if (config.searchKeywords || config.fullName || config.location || config.minSalary) {
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

  const fetchQuestions = async () => {
    try {
      const res = await fetch('/api/questions');
      const data = await res.json();
      if (data.success) {
        setQuestions(data.questions || []);
      }
    } catch (e) {
      console.error('Error loading questions', e);
    }
  };

  const handleExportAppliedJobsCsv = () => {
    window.open('/api/storage/export', '_blank');
  };

  const handleImportAppliedJobsCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/storage/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchAppliedHistory();
      } else {
        alert(`Gagal impor: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Terjadi error saat mengimpor: ${err.message || err}`);
    } finally {
      e.target.value = '';
    }
  };

  const handleExportQuestionsCsv = () => {
    window.open('/api/storage/export?type=questions', '_blank');
  };

  const handleImportQuestionsCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/storage/import?type=questions', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchQuestions();
      } else {
        alert(`Gagal impor pertanyaan: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Terjadi error saat mengimpor pertanyaan: ${err.message || err}`);
    } finally {
      e.target.value = '';
    }
  };

  const handleClearAppliedHistory = async () => {
    if (!confirm('Apakah Anda yakin ingin mengosongkan semua riwayat lamaran yang tersimpan di komputer?')) return;
    try {
      const res = await fetch('/api/applied', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setAppliedJobs([]);
        alert('Riwayat lamaran berhasil dikosongkan.');
      }
    } catch (err: any) {
      alert(`Gagal mengosongkan riwayat: ${err.message || err}`);
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

  const fetchAppliedHistory = async () => {
    try {
      const res = await fetch('/api/applied');
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
        setSaveStatus({ type: 'success', message: 'Konfigurasi berhasil disimpan.' });
        setTimeout(() => setSaveStatus(null), 4000);
        fetchAppliedHistory();
        fetchQuestions();
      } else {
        setSaveStatus({ type: 'error', message: data.error || 'Gagal menyimpan konfigurasi.' });
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', message: err.message || 'Terjadi kesalahan saat menyimpan.' });
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
      alert('Konfigurasi berhasil diimpor.');
      fetchAppliedHistory();
      fetchQuestions();
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
    if (!confirm('Apakah Anda yakin ingin mengosongkan semua data konfigurasi dan profil?')) {
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
      alert('Semua data konfigurasi dan profil berhasil direset.');
      fetchQuestions();
      fetchAppliedHistory();
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

  const executeStartBot = async () => {
    if (isBotRunning) return;

    if (isSetupBrowserRunning) {
      try {
        await fetch('/api/setup-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop' }),
        });
        setIsSetupBrowserRunning(false);
      } catch (e) {}
    }

    setLogs([`[${new Date().toLocaleTimeString()}] [INFO] Menghubungkan ke Bot Engine...`]);
    setIsBotRunning(true);
    setActiveTab('logs');

    const configParam = encodeURIComponent(JSON.stringify(config));
    const eventSource = new EventSource(`/api/run-bot?mode=headful&config=${configParam}`);
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
      fetchAppliedHistory();
    };
  };

  const handleStartBot = () => {
    if (isBotRunning) return;
    executeStartBot();
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
    fetchAppliedHistory();
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
        alert(`${data.message} (${data.count} pertanyaan unik tersimpan).`);
        fetchQuestions();
      } else {
        alert(`Gagal membersihkan duplikat: ${data.error || data.message}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-sm sticky top-0 z-30 px-6 py-3.5 flex flex-col md:flex-row justify-between items-center gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-slate-900 tracking-tight">
              CV Blaster
            </span>
            <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full border border-slate-200 font-medium">
              v2.0
            </span>
          </div>
          <span className="hidden sm:inline-block text-xs text-slate-400 font-normal">
            Glints • Jobstreet • LinkedIn
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Setup Browser Button */}
          <button
            type="button"
            onClick={handleToggleSetupBrowser}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors duration-150 cursor-pointer shadow-xs ${
              isSetupBrowserRunning
                ? 'bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100'
                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'
            }`}
          >
            {isSetupBrowserRunning ? 'Tutup Browser Setup' : 'Buka Browser (Login Setup)'}
          </button>

          {/* Bot Control Button */}
          {isBotRunning ? (
            <button
              type="button"
              onClick={handleStopBot}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors duration-150 shadow-xs cursor-pointer flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
              Hentikan Bot
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartBot}
              disabled={isSetupBrowserRunning}
              className={`px-4 py-2 rounded-lg font-semibold text-xs transition-colors duration-150 shadow-xs cursor-pointer flex items-center gap-2 ${
                isSetupBrowserRunning
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              Jalankan Bot
            </button>
          )}
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 mb-6 flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`px-4 py-2.5 font-medium text-xs rounded-t-lg transition-colors duration-150 cursor-pointer border-b-2 -mb-px ${
              activeTab === 'config'
                ? 'border-indigo-600 text-indigo-600 font-semibold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            Konfigurasi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2.5 font-medium text-xs rounded-t-lg transition-colors duration-150 cursor-pointer border-b-2 -mb-px ${
              activeTab === 'profile'
                ? 'border-indigo-600 text-indigo-600 font-semibold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            Profil Pelamar
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('questions');
              fetchQuestions();
            }}
            className={`px-4 py-2.5 font-medium text-xs rounded-t-lg transition-colors duration-150 cursor-pointer border-b-2 -mb-px ${
              activeTab === 'questions'
                ? 'border-indigo-600 text-indigo-600 font-semibold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            Database Pertanyaan
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2.5 font-medium text-xs rounded-t-lg transition-colors duration-150 cursor-pointer border-b-2 -mb-px flex items-center gap-2 ${
              activeTab === 'logs'
                ? 'border-indigo-600 text-indigo-600 font-semibold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            Live Logs
            {isBotRunning && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              fetchAppliedHistory();
            }}
            className={`px-4 py-2.5 font-medium text-xs rounded-t-lg transition-colors duration-150 cursor-pointer border-b-2 -mb-px ${
              activeTab === 'history'
                ? 'border-indigo-600 text-indigo-600 font-semibold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            Riwayat Lamaran
          </button>
        </div>

        {/* Tab Contents */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 md:p-6 shadow-xs">
          {/* TAB 1: CONFIGURATION */}
          {activeTab === 'config' && (
            <form onSubmit={handleSaveConfig} className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2.5">
                  Pilihan Platform
                </h2>
                <div className="flex gap-5 items-center py-3 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.enableGlints}
                      onChange={(e) => setConfig({ ...config, enableGlints: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-medium text-slate-700">Aktifkan Glints</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.enableJobstreet}
                      onChange={(e) => setConfig({ ...config, enableJobstreet: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-xs font-medium text-slate-700">Aktifkan Jobstreet</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.enableLinkedin}
                      onChange={(e) => setConfig({ ...config, enableLinkedin: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="text-xs font-medium text-slate-700">Aktifkan LinkedIn</span>
                  </label>

                  {/* Separator */}
                  <div className="h-4 w-px bg-slate-200 hidden md:block"></div>

                  <label className="flex items-center gap-2 cursor-pointer bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                    <input
                      type="checkbox"
                      checked={config.debugTest}
                      onChange={(e) => setConfig({ ...config, debugTest: e.target.checked })}
                      className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-xs font-medium text-amber-800">Debug Mode (Simulasi / Tanpa Submit)</span>
                  </label>
                </div>
              </div>

              {/* Update Status Lamaran */}
              <div>
                <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2.5">
                  Update Status Lamaran
                </h2>
                <div className="flex gap-5 items-center py-3 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.syncGlintsStatus || false}
                      onChange={(e) => setConfig({ ...config, syncGlintsStatus: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className="text-xs font-medium text-slate-700">Update Status Glints</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.syncJobstreetStatus || false}
                      onChange={(e) => setConfig({ ...config, syncJobstreetStatus: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-xs font-medium text-slate-700">Update Status Jobstreet</span>
                  </label>
                </div>
              </div>

              <div>
                <div className="border-b border-slate-200 pb-2.5">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Filter Pencarian
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                      Kata Kunci Pekerjaan
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: React Developer, Node JS, Frontend"
                      value={config.searchKeywords}
                      onChange={(e) => setConfig({ ...config, searchKeywords: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors duration-150"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                      Lokasi Kerja
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Jakarta, Remote"
                      value={config.location}
                      onChange={(e) => setConfig({ ...config, location: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors duration-150"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                      Worker Konkuren
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={10}
                      value={config.concurrency}
                      onChange={(e) => setConfig({ ...config, concurrency: parseInt(e.target.value) || 3 })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors duration-150"
                    />
                  </div>
                </div>
              </div>

              {/* Skema Limit Per Day / Per Platform */}
              <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Pengaturan Kuota Harian</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Pembagian batas kuota lamaran per hari.</p>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg border border-slate-200 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, limitMode: 'shared' })}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                        (config.limitMode || 'shared') === 'shared'
                          ? 'bg-white text-slate-900 shadow-xs font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Kuota Gabungan
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, limitMode: 'per_platform' })}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                        config.limitMode === 'per_platform'
                          ? 'bg-white text-slate-900 shadow-xs font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Kuota Per-Platform
                    </button>
                  </div>
                </div>

                {(config.limitMode || 'shared') === 'shared' ? (
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="w-48">
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                          Total Limit Gabungan
                        </label>
                        <input
                          type="number"
                          required
                          min={1}
                          value={config.limitPerDay}
                          onChange={(e) => setConfig({ ...config, limitPerDay: parseInt(e.target.value) || 0 })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500 font-bold text-xs"
                        />
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-600">
                        Total gabungan maksimal <b>{config.limitPerDay} lamaran</b> untuk semua portal aktif.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">
                        Limit Glints
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={config.limitGlints || 80}
                        onChange={(e) => setConfig({ ...config, limitGlints: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500 font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-purple-700 uppercase tracking-wider mb-1">
                        Limit Jobstreet
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={config.limitJobstreet || 75}
                        onChange={(e) => setConfig({ ...config, limitJobstreet: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500 font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-sky-700 uppercase tracking-wider mb-1">
                        Limit LinkedIn
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={config.limitLinkedin || 50}
                        onChange={(e) => setConfig({ ...config, limitLinkedin: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500 font-bold text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Integrasi Google Gemini AI */}
              <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                      Google Gemini AI
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Menjawab pertanyaan kuesioner lowongan yang belum ada di database.
                    </p>
                  </div>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium underline flex items-center gap-1 self-start sm:self-auto"
                  >
                    <span>Dapatkan API Key</span>
                    <span>↗</span>
                  </a>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Gemini API Key <span className="text-slate-400 font-normal lowercase">(opsional)</span>
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type={showGeminiKey ? 'text' : 'password'}
                      placeholder="AIzaSy... (kosongkan jika tidak menggunakan AI)"
                      value={config.geminiApiKey || ''}
                      onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2 pr-28 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 tracking-wider transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[11px] rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition font-medium cursor-pointer"
                    >
                      {showGeminiKey ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Opsional. Jika kosong, bot akan menggunakan database pertanyaan dan opsi default.
                  </p>
                </div>
              </div>

              <div className="border-b border-slate-200 pb-3 pt-2 space-y-3">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Penyimpanan Data Lokal
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Kelola cadangan (backup) dan pemulihan (restore) database lokal Anda dalam format CSV.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono font-medium">
                      {appliedJobs.length} Lamaran
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono font-medium">
                      {questions.length} Pertanyaan
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Riwayat Lamaran Actions */}
                  <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block">Riwayat Lamaran</span>
                      <span className="text-[11px] text-slate-500 font-mono">{appliedJobs.length} data tersimpan</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={handleExportAppliedJobsCsv}
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition shadow-2xs cursor-pointer"
                        title="Ekspor seluruh riwayat lamaran ke CSV"
                      >
                        Export CSV
                      </button>
                      <label className="cursor-pointer px-2.5 py-1 rounded-md text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition shadow-2xs" title="Impor data riwayat lamaran dari CSV">
                        Import CSV
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleImportAppliedJobsCsv}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleClearAppliedHistory}
                        className="px-2 py-1 rounded-md text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent transition cursor-pointer"
                        title="Kosongkan seluruh riwayat lamaran"
                      >
                        Kosongkan
                      </button>
                    </div>
                  </div>

                  {/* Bank Pertanyaan Actions */}
                  <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block">Bank Pertanyaan</span>
                      <span className="text-[11px] text-slate-500 font-mono">{questions.length} pertanyaan tersimpan</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={handleExportQuestionsCsv}
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition shadow-2xs cursor-pointer"
                        title="Ekspor seluruh bank pertanyaan ke CSV"
                      >
                        Export CSV
                      </button>
                      <label className="cursor-pointer px-2.5 py-1 rounded-md text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition shadow-2xs" title="Impor bank pertanyaan dari CSV">
                        Import CSV
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleImportQuestionsCsv}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleCleanCsv}
                        className="px-2 py-1 rounded-md text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border border-transparent transition cursor-pointer"
                        title="Bersihkan duplikat pertanyaan"
                      >
                        Deduplikasi
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {saveStatus && (
                <div
                  className={`p-3 rounded-lg text-xs ${
                    saveStatus.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-800'
                  }`}
                >
                  {saveStatus.message}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap pt-2">
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className={`font-semibold px-5 py-2 rounded-lg text-xs transition flex items-center gap-2 cursor-pointer shadow-xs ${
                    isSavingConfig
                      ? 'bg-indigo-400 text-white cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {isSavingConfig ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span>Menyimpan Konfigurasi...</span>
                    </>
                  ) : (
                    <span>Simpan Konfigurasi</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleResetConfig}
                  className="font-medium px-4 py-2 rounded-lg text-xs bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-300 hover:border-rose-300 transition cursor-pointer"
                  title="Kosongkan semua form dan kembalikan ke kondisi baru"
                >
                  Reset Pengaturan
                </button>
              </div>
            </form>
          )}
          {/* TAB 2: CANDIDATE PROFILE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveConfig} className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Profil Pelamar
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Data referensi untuk menjawab kuesioner dan kualifikasi lowongan kerja secara otomatis.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleExportConfig}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                    title="Unduh backup konfigurasi & profil ke file JSON"
                  >
                    Backup Config
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsImportModalOpen(true); setImportError(null); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                    title="Impor konfigurasi dari teks atau file JSON"
                  >
                    Restore Config
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Yoga Adi Saputra"
                    value={config.fullName || ''}
                    onChange={(e) => setConfig({ ...config, fullName: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors duration-150"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Gaji Bulanan yang Diharapkan (IDR)
                  </label>
                  <input
                    type="number"
                    placeholder="Contoh: 8000000"
                    value={config.expectedSalary || ''}
                    onChange={(e) => setConfig({ ...config, expectedSalary: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors duration-150"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Nilai IPK / GPA
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 3.75"
                    value={config.gpa || ''}
                    onChange={(e) => setConfig({ ...config, gpa: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors duration-150"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Jenjang Pendidikan Terakhir
                  </label>
                  <select
                    value={config.educationLevel || 'Sarjana (S1)'}
                    onChange={(e) => setConfig({ ...config, educationLevel: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors duration-150"
                  >
                    <option value="Sarjana (S1)">Sarjana (S1) / Bachelor Degree</option>
                    <option value="Diploma (D3)">Diploma (D3)</option>
                    <option value="Magister (S2)">Magister (S2) / Master Degree</option>
                    <option value="SMA/SMK">SMA / SMK</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Total Pengalaman Kerja (Tahun)
                  </label>
                  <input
                    type="number"
                    placeholder="Contoh: 3"
                    value={config.yearsOfExperience || 3}
                    onChange={(e) => setConfig({ ...config, yearsOfExperience: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors duration-150"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Waktu Mulai Bekerja (Notice Period)
                  </label>
                  <select
                    value={config.noticePeriod || 'Immediately'}
                    onChange={(e) => setConfig({ ...config, noticePeriod: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors duration-150"
                  >
                    <option value="Immediately">Immediately / Secepatnya / ASAP (Default)</option>
                    <option value="2 weeks">2 Minggu (2 weeks)</option>
                    <option value="1 month">1 Bulan (1 month)</option>
                    <option value="2 months">2 Bulan (2 months)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Nomor Telepon / WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 081234567890"
                    value={config.phoneNumber || ''}
                    onChange={(e) => setConfig({ ...config, phoneNumber: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors duration-150"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Link Portofolio / Website
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: https://github.com/yogaadi"
                    value={config.portfolioUrl || ''}
                    onChange={(e) => setConfig({ ...config, portfolioUrl: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors duration-150"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Link GitHub
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: https://github.com/yogaadi"
                    value={config.githubUrl || ''}
                    onChange={(e) => setConfig({ ...config, githubUrl: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors duration-150"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Link LinkedIn
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: https://www.linkedin.com/in/yoga-adi"
                    value={config.linkedinUrl || ''}
                    onChange={(e) => setConfig({ ...config, linkedinUrl: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors duration-150"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Domisili / Lokasi Tempat Tinggal
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Jakarta Selatan, DKI Jakarta"
                    value={config.domicile || ''}
                    onChange={(e) => setConfig({ ...config, domicile: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors duration-150"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Daftar Keahlian / Skills &amp; Tools (Pisahkan dengan koma)
                    </label>
                    <div className="group relative cursor-pointer">
                      <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-slate-100 text-slate-500 border border-slate-300">
                        ?
                      </span>
                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-80 p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 shadow-xl z-50 pointer-events-none">
                        <p className="font-semibold text-indigo-600 mb-1">Checklist Keahlian:</p>
                        <p className="leading-relaxed text-slate-600">Daftar keahlian dan tools yang Anda kuasai untuk pengisian kuesioner lowongan.</p>
                        <p className="mt-1.5 text-slate-600">• <strong className="text-purple-600">Jobstreet</strong>: Mencentang opsi kualifikasi yang cocok.</p>
                        <p className="text-slate-600">• <strong className="text-emerald-600">Glints</strong>: Memilih tingkat keahlian.</p>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTemplateModalOpen(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    Pilih Template Profesi
                  </button>
                </div>
                <textarea
                  rows={5}
                  placeholder="Contoh: JavaScript, TypeScript, React, Next.js, Node.js, Express, Go, PostgreSQL, MySQL, RESTful API, Docker, Git"
                  value={config.skills || ''}
                  onChange={(e) => setConfig({ ...config, skills: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 leading-relaxed font-mono transition-colors duration-150"
                />
              </div>

              {saveStatus && (
                <div
                  className={`p-3 rounded-lg text-xs ${
                    saveStatus.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-800'
                  }`}
                >
                  {saveStatus.message}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap pt-2">
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className={`font-semibold px-5 py-2 rounded-lg text-xs transition flex items-center gap-2 cursor-pointer shadow-xs ${
                    isSavingConfig
                      ? 'bg-indigo-400 text-white cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {isSavingConfig ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span>Menyimpan Profil...</span>
                    </>
                  ) : (
                    <span>Simpan Profil</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleResetConfig}
                  className="font-medium px-4 py-2 rounded-lg text-xs bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-300 hover:border-rose-300 transition cursor-pointer"
                  title="Kembalikan form ke awal"
                >
                  Reset Form
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: QUESTIONS DATABASE */}
          {activeTab === 'questions' && (
            <div className="space-y-6">
              {/* Header & Controls */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Database Pertanyaan
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">
                    {questions.length} pertanyaan tersimpan
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Export Questions CSV */}
                  <button
                    type="button"
                    onClick={handleExportQuestionsCsv}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title="Unduh seluruh bank pertanyaan ke format CSV"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export CSV
                  </button>

                  {/* Import Questions CSV */}
                  <label className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition flex items-center gap-1.5 shadow-2xs" title="Impor bank pertanyaan dari file CSV">
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Import CSV
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleImportQuestionsCsv}
                      className="hidden"
                    />
                  </label>

                  {/* Clean Duplicate Questions Button */}
                  <button
                    type="button"
                    onClick={handleCleanCsv}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    Bersihkan Duplikat
                  </button>

                  {/* Add New Question Button */}
                  <button
                    type="button"
                    onClick={() => setIsNewQuestionModalOpen(true)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    Tambah Pertanyaan
                  </button>
                </div>
              </div>

              {/* Status Alert Banner */}
              {csvSaveStatus && (
                <div
                  className={`p-3 rounded-lg text-xs ${
                    csvSaveStatus.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-800'
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
                    placeholder="Cari pertanyaan, tipe, atau jawaban..."
                    value={questionSearch}
                    onChange={(e) => setQuestionSearch(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-colors"
                  />
                  {questionSearch && (
                    <button
                      type="button"
                      onClick={() => setQuestionSearch('')}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg border border-slate-200 transition cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Questions Table */}
                <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-2xs">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="p-3 w-12 text-center">No</th>
                        <th className="p-3">Pertanyaan</th>
                        <th className="p-3 w-28">Tipe</th>
                        <th className="p-3">Pilihan Opsi</th>
                        <th className="p-3">Jawaban Bot</th>
                        <th className="p-3 w-28 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-normal">
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
                              <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                                {questionSearch
                                  ? `Tidak ditemukan pertanyaan yang cocok dengan "${questionSearch}".`
                                  : 'Belum ada pertanyaan di database.'}
                              </td>
                            </tr>
                          );
                        }

                        return filtered.map((item, idx) => {
                          let typeBadge = 'bg-slate-100 text-slate-700 border-slate-200';
                          if (item.type === 'radiobutton') typeBadge = 'bg-blue-50 text-blue-700 border-blue-200';
                          if (item.type === 'checklist') typeBadge = 'bg-purple-50 text-purple-700 border-purple-200';
                          if (item.type === 'text') typeBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                          if (item.type === 'dropdown') typeBadge = 'bg-amber-50 text-amber-700 border-amber-200';

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="p-3 text-center text-slate-400 text-xs font-mono">{idx + 1}</td>
                              <td className="p-3 font-medium text-slate-900">{item.question}</td>
                              <td className="p-3">
                                <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${typeBadge}`}>
                                  {item.type || 'radiobutton'}
                                </span>
                              </td>
                              <td className="p-3 text-xs text-slate-500 max-w-xs truncate" title={item.options}>
                                {item.options || <span className="text-slate-400 italic">-</span>}
                              </td>
                              <td className="p-3">
                                <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs">
                                  {item.answer}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditingQuestion(item)}
                                    className="text-xs bg-white hover:bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded border border-slate-200 hover:border-indigo-200 transition shadow-2xs cursor-pointer"
                                    title="Edit Pertanyaan"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteQuestion(item.id)}
                                    className="text-xs bg-white hover:bg-rose-50 text-rose-700 px-2.5 py-1 rounded border border-slate-200 hover:border-rose-200 transition shadow-2xs cursor-pointer"
                                    title="Hapus Pertanyaan"
                                  >
                                    Hapus
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
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                  <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl text-slate-800">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                      <h3 className="text-sm font-semibold text-slate-900">Tambah Pertanyaan Baru</h3>
                      <button
                        type="button"
                        onClick={() => setIsNewQuestionModalOpen(false)}
                        className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleAddNewQuestion} className="space-y-4 text-xs">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Pertanyaan</label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: What is your latest GPA?"
                          value={newQuestionData.question}
                          onChange={(e) => setNewQuestionData({ ...newQuestionData, question: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Tipe Input</label>
                          <select
                            value={newQuestionData.type}
                            onChange={(e) => setNewQuestionData({ ...newQuestionData, type: e.target.value })}
                            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                          >
                            <option value="radiobutton">Radiobutton (Pilihan Tunggal)</option>
                            <option value="text">Text / TextArea (Isian Bebas)</option>
                            <option value="checklist">Checklist (Pilihan Ganda)</option>
                            <option value="dropdown">Dropdown</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Jawaban Bot</label>
                          <input
                            type="text"
                            required
                            placeholder="Contoh: 3.75 atau Ahli"
                            value={newQuestionData.answer}
                            onChange={(e) => setNewQuestionData({ ...newQuestionData, answer: e.target.value })}
                            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 font-semibold text-emerald-700"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                          Pilihan Opsi (Pisahkan dengan tanda | )
                        </label>
                        <input
                          type="text"
                          placeholder="Contoh: Tidak Berpengalaman | Dasar | Menengah | Ahli"
                          value={newQuestionData.options}
                          onChange={(e) => setNewQuestionData({ ...newQuestionData, options: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">Kosongkan jika tipe input adalah Text / TextArea.</p>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => setIsNewQuestionModalOpen(false)}
                          className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
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
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                  <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl text-slate-800">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                      <h3 className="text-sm font-semibold text-slate-900">Edit Pertanyaan</h3>
                      <button
                        type="button"
                        onClick={() => setEditingQuestion(null)}
                        className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleUpdateQuestion} className="space-y-4 text-xs">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Pertanyaan</label>
                        <input
                          type="text"
                          required
                          value={editingQuestion.question}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, question: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Tipe Input</label>
                          <select
                            value={editingQuestion.type}
                            onChange={(e) => setEditingQuestion({ ...editingQuestion, type: e.target.value })}
                            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                          >
                            <option value="radiobutton">Radiobutton (Pilihan Tunggal)</option>
                            <option value="text">Text / TextArea (Isian Bebas)</option>
                            <option value="checklist">Checklist (Pilihan Ganda)</option>
                            <option value="dropdown">Dropdown</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Jawaban Bot</label>
                          <input
                            type="text"
                            required
                            value={editingQuestion.answer}
                            onChange={(e) => setEditingQuestion({ ...editingQuestion, answer: e.target.value })}
                            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 font-semibold text-emerald-700"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                          Pilihan Opsi (Pisahkan dengan tanda | )
                        </label>
                        <input
                          type="text"
                          value={editingQuestion.options}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, options: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => setEditingQuestion(null)}
                          className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
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
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className={`h-2.5 w-2.5 rounded-full ${isBotRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                  <span className="text-sm font-semibold text-slate-900">Konsol Log Realtime</span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono">
                    {logs.length} baris
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setLogs([])}
                  className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer"
                >
                  Bersihkan Log
                </button>
              </div>

              <div className="bg-slate-950 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
                <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-700 inline-block" />
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-700 inline-block" />
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-700 inline-block" />
                    <span className="text-xs font-mono text-slate-400 ml-2">bot-runner stdout</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">UTF-8</span>
                </div>
                <div
                  ref={logTerminalRef}
                  className="h-96 p-4 font-mono text-xs overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800 text-slate-300 leading-relaxed"
                >
                  {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">
                      Belum ada aktivitas. Silakan jalankan bot untuk memantau proses secara langsung.
                    </div>
                  ) : (
                    logs.map((log, index) => {
                      let color = 'text-slate-300';
                      if (log.includes('✅') || log.includes('[SUCCESS]')) color = 'text-emerald-400';
                      if (log.includes('❌') || log.includes('🚨') || log.includes('[ERROR]') || log.includes('[FAILED]')) color = 'text-rose-400';
                      if (log.includes('⚠️') || log.includes('[WARN]')) color = 'text-amber-400';
                      if (log.includes('🚀') || log.includes('🏁') || log.includes('[START]') || log.includes('[DONE]')) color = 'text-sky-400 font-semibold';

                      return (
                        <div key={index} className={color}>
                          {log}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-sm font-semibold text-slate-900">Riwayat Lamaran</h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium border border-slate-200">
                    Total: {appliedJobs.length}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleExportAppliedJobsCsv}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                    title="Unduh seluruh data lamaran ke format CSV"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export CSV
                  </button>
                  <label className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Import CSV
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleImportAppliedJobsCsv}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => fetchAppliedHistory()}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50/50 transition cursor-pointer"
                  >
                    Muat Ulang
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAppliedHistory}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition cursor-pointer"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                        <th className="py-3 px-4">Perusahaan</th>
                        <th className="py-3 px-4">Posisi</th>
                        <th className="py-3 px-4">Platform</th>
                        <th className="py-3 px-4">Tanggal</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Tautan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {appliedJobs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500 italic">
                            Belum ada riwayat lamaran yang tersimpan di penyimpanan lokal.
                          </td>
                        </tr>
                      ) : (
                        appliedJobs.map((job, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4 font-semibold text-slate-900">{job.company}</td>
                            <td className="py-3 px-4 text-slate-700">{job.title}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                                  job.platform === 'Glints'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : job.platform === 'Jobstreet'
                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                    : job.platform === 'LinkedIn'
                                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {job.platform}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-500">{job.date}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                                  job.status === 'Tidak Sesuai' || job.status?.toLowerCase().includes('tidak sesuai')
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : job.status === 'Dalam Review' || job.status?.toLowerCase().includes('review') || job.status?.toLowerCase().includes('ditinjau')
                                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                                    : job.status === 'Wawancara' || job.status?.toLowerCase().includes('wawancara') || job.status?.toLowerCase().includes('interview')
                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                    : job.status === 'Diterima' || job.status?.toLowerCase().includes('diterima') || job.status?.toLowerCase().includes('offered')
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold'
                                    : job.status === 'Success' || job.status === 'Applied' || job.status === 'Dilamar'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : job.status === 'Already Applied'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {job.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <a
                                href={job.jobUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium text-xs inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>Buka</span>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL: IMPORT CONFIG (FILE OR TEXT) */}
        {isImportModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Impor Konfigurasi (JSON)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Impor konfigurasi dari teks JSON atau upload file backup.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setIsImportModalOpen(false); setImportError(null); }}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex rounded-lg bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => { setImportMode('text'); setImportError(null); }}
                  className={`flex-1 py-1.5 rounded-md transition cursor-pointer ${importMode === 'text' ? 'bg-white text-indigo-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Teks JSON
                </button>
                <button
                  type="button"
                  onClick={() => { setImportMode('file'); setImportError(null); }}
                  className={`flex-1 py-1.5 rounded-md transition cursor-pointer ${importMode === 'file' ? 'bg-white text-indigo-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Upload File .JSON
                </button>
              </div>

              {importError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
                  {importError}
                </div>
              )}

              {importMode === 'text' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Paste teks JSON konfigurasi Anda di sini:
                  </label>
                  <textarea
                    rows={8}
                    value={importJsonText}
                    onChange={(e) => setImportJsonText(e.target.value)}
                    placeholder={'{\n  "fullName": "Yoga Adi",\n  "expectedSalary": 8000000\n}'}
                    className="w-full bg-white border border-slate-300 rounded-lg p-3 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 placeholder:text-slate-400"
                  />
                </div>
              ) : (
                <div
                  className="py-8 border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl text-center cursor-pointer transition bg-slate-50/50 hover:bg-indigo-50/20 group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg className="w-8 h-8 mx-auto mb-2 text-slate-400 group-hover:text-indigo-600 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm font-semibold text-slate-800">Klik untuk memilih file konfigurasi .json</p>
                  <p className="text-xs text-slate-500 mt-1">Pilih file JSON hasil export sebelumnya</p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImportFile}
                    accept=".json"
                    className="hidden"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsImportModalOpen(false); setImportError(null); }}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium cursor-pointer"
                >
                  Batal
                </button>
                {importMode === 'text' && (
                  <button
                    type="button"
                    onClick={() => applyConfigJson(importJsonText)}
                    disabled={!importJsonText.trim()}
                    className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    Terapkan Konfigurasi
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL: PILIH TEMPLATE PROFESI */}
        {isTemplateModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-slate-50/80">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Pilih Template Profesi
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pilih bidang pekerjaan untuk mengisi keahlian dan kata kunci pencarian otomatis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Options Bar */}
              <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-slate-700 font-semibold">Opsi Penerapan Template:</span>
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={templateApplyOptions.skills}
                      onChange={(e) => setTemplateApplyOptions({ ...templateApplyOptions, skills: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span>Daftar Skill Checklist</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={templateApplyOptions.keywords}
                      onChange={(e) => setTemplateApplyOptions({ ...templateApplyOptions, keywords: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span>Kata Kunci Pencarian (Keywords)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={templateApplyOptions.profile}
                      onChange={(e) => setTemplateApplyOptions({ ...templateApplyOptions, profile: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span>Contoh Ekspektasi Gaji &amp; Pengalaman</span>
                  </label>
                </div>
              </div>

              {/* Grid of 8 Role Cards */}
              <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/30">
                {ROLE_TEMPLATES.map((role) => (
                  <div
                    key={role.id}
                    className="p-4 bg-white hover:bg-slate-50/60 border border-slate-200 hover:border-indigo-300 rounded-xl transition flex flex-col justify-between group shadow-2xs hover:shadow-xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition">
                            {role.name}
                          </h4>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium inline-block mt-0.5 ${role.badgeColor}`}>
                            {role.category}
                          </span>
                        </div>
                      </div>

                      {/* Highlight Skills Badges */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {role.highlightSkills.map((badge, idx) => (
                          <span key={idx} className="text-[11px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md font-medium">
                            {badge}
                          </span>
                        ))}
                      </div>

                      {/* Keywords Preview */}
                      <p className="mt-2.5 text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                        <strong className="text-slate-700 font-semibold">Keywords:</strong> {role.searchKeywords}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">
                        {role.skills.split(',').length}+ keahlian &amp; tools
                      </span>
                      <button
                        type="button"
                        onClick={() => handleApplyTemplate(role)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs hover:shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Terapkan Template</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-xs">
                <span className="text-slate-500">
                  Daftar keahlian dan kata kunci dapat disesuaikan kembali setelah template diterapkan.
                </span>
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-medium border border-slate-200 transition cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* End of Modals */}
      </main>
    </div>
  );
}
