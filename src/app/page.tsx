'use client';

import { useState, useEffect, useRef } from 'react';

interface AppConfig {
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
}

interface AppliedJob {
  company: string;
  title: string;
  platform: string;
  jobUrl: string;
  date: string;
  status: string;
}

export default function Home() {
  // Config state
  const [config, setConfig] = useState<AppConfig>({
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
  });

  // UI state
  const [activeTab, setActiveTab] = useState<'config' | 'logs' | 'history'>('config');
  const [logs, setLogs] = useState<string[]>([]);
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [isSetupBrowserRunning, setIsSetupBrowserRunning] = useState(false);
  const [appliedJobs, setAppliedJobs] = useState<AppliedJob[]>([]);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const logTerminalRef = useRef<HTMLDivElement>(null);

  // Load config & history on mount
  useEffect(() => {
    fetchConfig();
    fetchAppliedHistory();
    checkSetupBrowserStatus();

    // Check setup browser status every 5 seconds
    const interval = setInterval(checkSetupBrowserStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Scroll terminal logs to bottom when new logs arrive
  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [logs]);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data) {
        setConfig(data);
      }
    } catch (e) {
      console.error('Error loading config', e);
    }
  };

  const fetchAppliedHistory = async () => {
    try {
      const res = await fetch('/api/applied');
      const data = await res.json();
      if (data.success) {
        setAppliedJobs(data.data);
      }
    } catch (e) {
      console.error('Error loading applied history', e);
    }
  };

  const checkSetupBrowserStatus = async () => {
    try {
      const res = await fetch('/api/setup-login');
      const data = await res.json();
      setIsSetupBrowserRunning(data.isRunning);
    } catch (e) {
      console.error('Error checking setup browser status', e);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus(null);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus({ type: 'success', message: 'Config saved successfully! Google Sheet initialized.' });
        fetchAppliedHistory();
      } else {
        setSaveStatus({ type: 'error', message: data.error || 'Failed to save config' });
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', message: err.message || 'Error occurred' });
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

  const handleStartBot = (mode: 'headless' | 'headful' = 'headless') => {
    if (isBotRunning) return;

    setLogs([]);
    setIsBotRunning(true);
    setActiveTab('logs');

    const eventSource = new EventSource(`/api/run-bot?mode=${mode}`);
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
      fetchAppliedHistory(); // Refresh history table when done
    };
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
      const res = await fetch('/api/clean-csv', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`🧼 ${data.message} (${data.count} pertanyaan unik tersimpan)`);
      } else {
        alert(`❌ Gagal membersihkan CSV: ${data.error || data.message}`);
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
            v1.0 (Glints & Jobstreet)
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Clean CSV Button */}
          <button
            onClick={handleCleanCsv}
            disabled={isBotRunning}
            className="px-4 py-2 rounded text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-50 transition"
          >
            🧼 Bersihkan CSV
          </button>

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
        <div className="flex border-b border-slate-800 mb-6">
          <button
            onClick={() => setActiveTab('config')}
            className={`px-5 py-3 font-medium text-sm transition border-b-2 ${
              activeTab === 'config'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚙️ Konfigurasi
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

              <h2 className="text-lg font-semibold text-slate-200 border-b border-slate-800 pb-2">
                Filter Pencarian Pekerjaan
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Kata Kunci Pekerjaan (Search Keywords)
                  </label>
                  <input
                    type="text"
                    required
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
                    Limit per Hari (Daily Limit)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={config.limitPerDay}
                    onChange={(e) => setConfig({ ...config, limitPerDay: parseInt(e.target.value) || 0 })}
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

              <h2 className="text-lg font-semibold text-slate-200 border-b border-slate-800 pb-2 pt-4">
                Integrasi Google Sheets API
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    Nama Sheet (Sheet Name)
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

              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded transition"
              >
                💾 Simpan Konfigurasi
              </button>
            </form>
          )}

          {/* TAB 2: LIVE LOGS */}
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
                  onClick={fetchAppliedHistory}
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
                                  : 'bg-purple-950 text-purple-400 border border-purple-900'
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
      </main>
    </div>
  );
}
