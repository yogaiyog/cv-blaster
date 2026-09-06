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

export default function Home() {
  // Config state
  const [config, setConfig] = useState<AppConfig>({
    spreadsheetId: '',
    sheetName: 'Sheet1',
    questionsSheetName: 'Screening Questions',
    googleCredentialsJson: '',
    searchKeywords: '',
    location: '',
    minSalary: '',
    limitPerDay: 20,
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
    skills: 'JavaScript, TypeScript, React, React.js, Next.js, Node.js, Express.js, Go, Golang, HTML, HTML5, CSS, CSS3, Tailwind CSS, PostgreSQL, MySQL, RESTful API, Docker, Git',
    portfolioUrl: 'https://github.com/yogaadi',
    githubUrl: 'https://github.com/yogaadi',
    linkedinUrl: 'https://www.linkedin.com',
    phoneNumber: '081234567890',
    domicile: 'Jakarta Selatan, DKI Jakarta',
  });

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

  // Question CSV & Sheets state
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [questionsSource, setQuestionsSource] = useState<'google_sheets' | 'local_csv'>('local_csv');
  const [rawCsvText, setRawCsvText] = useState('');
  const [csvViewMode, setCsvViewMode] = useState<'table' | 'raw'>('table');
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
        if (data.rawCsv) setRawCsvText(data.rawCsv);
      }
    } catch (e) {
      console.error('Error loading questions', e);
    }
  };

  const handleSaveRawCsv = async () => {
    setCsvSaveStatus(null);
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_raw', rawCsv: rawCsvText, config }),
      });
      const data = await res.json();
      if (data.success) {
        setCsvSaveStatus({ type: 'success', message: 'Daftar pertanyaan berhasil diperbarui!' });
        fetchQuestions();
      } else {
        setCsvSaveStatus({ type: 'error', message: data.error || 'Gagal menyimpan pertanyaan' });
      }
    } catch (e: any) {
      setCsvSaveStatus({ type: 'error', message: e.message || 'Gagal menyimpan pertanyaan' });
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

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], 'UTF-8');
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          const merged = { ...config, ...parsed };
          setConfig(merged);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          alert('✅ Konfigurasi berhasil diimpor!');
          fetchAppliedHistory(merged);
          fetchQuestions(merged);
        } catch {
          alert('❌ Format file JSON konfigurasi tidak valid.');
        }
      };
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

              <div className="flex justify-between items-center border-b border-slate-800 pb-2 pt-4 flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-200">
                    Integrasi Google Sheets API (Cloud Database)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Digunakan untuk menyimpan log riwayat lamaran dan knowledge base pertanyaan kuisioner (tanpa butuh DB).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportConfig}
                    className="px-3 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
                    title="Unduh backup konfigurasi & profil ke file JSON"
                  >
                    📤 Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
                    title="Impor konfigurasi dari file JSON"
                  >
                    📥 Import JSON
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImportConfig}
                    accept=".json"
                    className="hidden"
                  />
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
                    onClick={() => setConfig({
                      ...config,
                      skills: "JavaScript, TypeScript, Python, Java, C#, C++, PHP, Go, HTML, CSS, React, React.js, Next.js, Angular, Angular.js, Tailwind CSS, Bootstrap, jQuery, Framer Motion, Three.js, React Three Fiber, Drei, Node.js, Express.js, Fiber, GORM, REST API, RESTful API, Redis, RabbitMQ, Celery, Asynq, Message Queue, Kafka, PostgreSQL, MySQL, Supabase, Prisma, SQL, Docker, Nginx, PM2, Git, GitHub, GitHub Actions, Cloudflare, Let's Encrypt, Certbot, CI/CD, Postman, VS Code, Full Stack Development, Backend Development, Frontend Development, Web Development, API Development, Database Design, Microservices, Object-Oriented Programming, Asynchronous Programming, Blender, TouchDesigner, MediaPipe, Figma, ClickUp, Jira, Trello, Slack, Notion, Agile, Scrum, Problem Solving, Debugging"
                    })}
                    className="text-xs text-blue-400 hover:text-blue-300 underline font-medium"
                  >
                    Reset ke Template Lengkap
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
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Local / Default CSV
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Knowledge base pertanyaan & jawaban kuisioner screening lowongan (Glints, Jobstreet, LinkedIn, Indeed).
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* View Mode Toggle */}
                  <div className="bg-slate-900 border border-slate-800 rounded p-0.5 flex text-xs">
                    <button
                      onClick={() => setCsvViewMode('table')}
                      className={`px-3 py-1.5 rounded transition font-medium ${
                        csvViewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      📊 Tabel Visual
                    </button>
                    <button
                      onClick={() => setCsvViewMode('raw')}
                      className={`px-3 py-1.5 rounded transition font-medium ${
                        csvViewMode === 'raw' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      📝 Editor Mentah (CSV)
                    </button>
                  </div>


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

              {/* VIEW MODE 1: VISUAL TABLE */}
              {csvViewMode === 'table' && (
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
                                    : 'Belum ada pertanyaan di database CSV.'}
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
              )}

              {/* VIEW MODE 2: RAW TEXTAREA EDITOR */}
              {csvViewMode === 'raw' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>Edit teks CSV langsung. Format: <code>Question,Type,Options,Answer</code></span>
                    <button
                      onClick={() => fetchQuestions()}
                      className="text-slate-400 hover:text-slate-200 underline transition"
                    >
                      🔄 Reload dari file
                    </button>
                  </div>
                  <textarea
                    rows={18}
                    value={rawCsvText}
                    onChange={(e) => setRawCsvText(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-4 font-mono text-xs text-slate-200 focus:outline-none focus:border-blue-500 leading-relaxed scrollbar-thin scrollbar-thumb-slate-800"
                    placeholder="Question,Type,Options,Answer..."
                  />
                  <button
                    onClick={handleSaveRawCsv}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded transition text-sm flex items-center gap-2"
                  >
                    💾 Simpan Perubahan CSV Mentah
                  </button>
                </div>
              )}

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
                          Simpan ke CSV
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
