import path from 'path';
import { AppConfig, getConfig } from './config';
import { runGlintsBot } from './bots/glints';
import { runJobstreetBot } from './bots/jobstreet';
import { runLinkedinBot } from './bots/linkedin';
import { runIndeedBot } from './bots/indeed';

declare global {
  var isBotRunning: boolean;
  var activeBotBrowser: any;
  var activeSetupBrowser: any;
}

export async function startBot(
  onLog: (msg: string) => void,
  mode: string = 'headless',
  customConfig?: AppConfig
) {
  if (global.isBotRunning) {
    onLog('⚠️ Bot is already running!');
    return;
  }

  global.isBotRunning = true;
  onLog(`🚀 Starting CV Blaster Engine in ${mode.toUpperCase()} mode...`);

  let browser: any = null;
  try {
    const config = customConfig || getConfig();

    // Set GEMINI_API_KEY if provided (Optional)
    const geminiApiKey = (config.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
    if (geminiApiKey) {
      process.env.GEMINI_API_KEY = geminiApiKey;
      onLog('🧠 Gemini AI aktif untuk menjawab pertanyaan kuesioner baru.');
    } else {
      process.env.GEMINI_API_KEY = '';
      onLog('ℹ️ Gemini API Key tidak diisi (Mode Offline/Tanpa AI). Pertanyaan di luar database akan dijawab dengan aturan default/pilihan pertama.');
    }

    const hasJobSearchPlatforms = config.enableGlints || config.enableJobstreet || config.enableLinkedin || config.enableIndeed;
    if (hasJobSearchPlatforms && !config.searchKeywords && !config.indeedNoJobTitleFilter) {
      throw new Error('Search keywords are not configured. Please fill them in first.');
    }

    // Close active setup browser if open to avoid userDataDir collision
    if (global.activeSetupBrowser) {
      onLog('ℹ️ Menutup browser sesi Login Setup yang masih terbuka...');
      try {
        await global.activeSetupBrowser.close();
      } catch {}
      global.activeSetupBrowser = null;
      await new Promise(r => setTimeout(r, 1000));
    }

    // Close previous active bot browser if lingering
    if (global.activeBotBrowser) {
      onLog('ℹ️ Menutup browser sesi bot sebelumnya...');
      try {
        await global.activeBotBrowser.close();
      } catch {}
      global.activeBotBrowser = null;
      await new Promise(r => setTimeout(r, 1000));
    }

    // Test Google Sheets connection
    onLog('📊 Menguji koneksi ke Google Sheets...');
    const { testSheetsConnection } = require('./googleSheets');
    const sheetsTest = await testSheetsConnection(config);
    if (sheetsTest.success) {
      onLog(`✅ Google Sheets terhubung: ${sheetsTest.message}`);
    } else {
      onLog(`⚠️ Peringatan: Gagal terhubung ke Google Sheets (${sheetsTest.error})`);
      onLog(`   ℹ️ Lamaran tetap akan diproses, namun riwayat sheets tidak tersimpan jika koneksi terputus.`);
    }

    // Launch browser with Google Chrome priority and Chromium fallback
    const { launchBrowserWithFallback } = require('./browserHelper');
    const launchResult = await launchBrowserWithFallback(mode as any, onLog);
    browser = launchResult.browser;
    global.activeBotBrowser = browser;

    let totalSuccess = 0;
    let totalAlreadyApplied = 0;
    let totalErrors = 0;

    const isSharedMode = config.limitMode !== 'per_platform';
    const sharedLimitTarget = config.limitPerDay || 155;

    if (isSharedMode) {
      onLog(`🎯 Mode Kuota: Kuota Gabungan Aktif (Target Total: ${sharedLimitTarget} lamaran untuk semua platform).`);
    } else {
      onLog(`🎯 Mode Kuota: Kuota Per-Platform Aktif (Glints: ${config.limitGlints || 80}, JobStreet: ${config.limitJobstreet || 75}, LinkedIn: ${config.limitLinkedin || 50}).`);
    }

    const glintsLimiter = {
      getTargetLimit: () => isSharedMode ? sharedLimitTarget : (config.limitGlints || config.limitPerDay || 80),
      isLimitReached: (currentGlintsSuccess: number) => {
        if (isSharedMode) {
          return totalSuccess >= sharedLimitTarget;
        }
        return currentGlintsSuccess >= (config.limitGlints || config.limitPerDay || 80);
      },
      onJobSuccess: () => {
        totalSuccess++;
      }
    };

    const jobstreetLimiter = {
      getTargetLimit: () => isSharedMode ? sharedLimitTarget : (config.limitJobstreet || config.limitPerDay || 75),
      isLimitReached: (currentJobstreetSuccess: number) => {
        if (isSharedMode) {
          return totalSuccess >= sharedLimitTarget;
        }
        return currentJobstreetSuccess >= (config.limitJobstreet || config.limitPerDay || 75);
      },
      onJobSuccess: () => {
        totalSuccess++;
      }
    };

    const linkedinLimiter = {
      getTargetLimit: () => isSharedMode ? sharedLimitTarget : (config.limitLinkedin || config.limitPerDay || 50),
      isLimitReached: (currentLinkedinSuccess: number) => {
        if (isSharedMode) {
          return totalSuccess >= sharedLimitTarget;
        }
        return currentLinkedinSuccess >= (config.limitLinkedin || config.limitPerDay || 50);
      },
      onJobSuccess: () => {
        totalSuccess++;
      }
    };

    const indeedLimiter = {
      getTargetLimit: () => isSharedMode ? sharedLimitTarget : (config.limitIndeed || config.limitPerDay || 50),
      isLimitReached: (currentIndeedSuccess: number) => {
        if (isSharedMode) {
          return totalSuccess >= sharedLimitTarget;
        }
        return currentIndeedSuccess >= (config.limitIndeed || config.limitPerDay || 50);
      },
      onJobSuccess: () => {
        totalSuccess++;
      }
    };

    const initialPages = await browser.pages();
    let initialPageUsed = false;

    const getOrNewPage = async () => {
      if (!initialPageUsed && initialPages.length > 0 && initialPages[0]) {
        initialPageUsed = true;
        return initialPages[0];
      }
      return await browser.newPage();
    };

    const tasks: Promise<void>[] = [];

    // ----------------------------------------------------
    // TAB 1: GLINTS AUTOMATION
    // ----------------------------------------------------
    if (config.enableGlints) {
      tasks.push((async () => {
        const pageGlints = await getOrNewPage();
        await pageGlints.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        const glintsLog = (msg: string) => onLog(`[Glints] ${msg}`);

        glintsLog('🔍 Memulai proses bot Glints di Tab khusus...');
        try {
          const metrics = await runGlintsBot(pageGlints, config, glintsLog, glintsLimiter);
          totalAlreadyApplied += metrics.alreadyAppliedCount;
          totalErrors += metrics.errorCount;
        } catch (err: any) {
          glintsLog(`❌ Error: ${err.message || err}`);
          totalErrors++;
        } finally {
          try { await pageGlints.close(); } catch {}
        }
      })());
    } else {
      onLog('⏩ Glints dinonaktifkan di pengaturan.');
    }

    // ----------------------------------------------------
    // TAB 2: JOBSTREET AUTOMATION
    // ----------------------------------------------------
    if (config.enableJobstreet) {
      tasks.push((async () => {
        const pageJobstreet = await getOrNewPage();
        await pageJobstreet.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        const jobstreetLog = (msg: string) => onLog(`[Jobstreet] ${msg}`);

        jobstreetLog('🔍 Memulai proses bot Jobstreet di Tab khusus...');
        try {
          const metrics = await runJobstreetBot(pageJobstreet, config, jobstreetLog, jobstreetLimiter);
          totalAlreadyApplied += metrics.alreadyAppliedCount;
          totalErrors += metrics.errorCount;
        } catch (err: any) {
          jobstreetLog(`❌ Error: ${err.message || err}`);
          totalErrors++;
        } finally {
          try { await pageJobstreet.close(); } catch {}
        }
      })());
    } else {
      onLog('⏩ Jobstreet dinonaktifkan di pengaturan.');
    }

    // ----------------------------------------------------
    // TAB 3: LINKEDIN AUTOMATION
    // ----------------------------------------------------
    if (config.enableLinkedin) {
      tasks.push((async () => {
        const pageLinkedin = await getOrNewPage();
        await pageLinkedin.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        const linkedinLog = (msg: string) => onLog(`[LinkedIn] ${msg}`);

        linkedinLog('🔍 Memulai proses bot LinkedIn di Tab khusus...');
        try {
          const metrics = await runLinkedinBot(pageLinkedin, config, linkedinLog, linkedinLimiter);
          totalAlreadyApplied += metrics.alreadyAppliedCount;
          totalErrors += metrics.errorCount;
        } catch (err: any) {
          linkedinLog(`❌ Error: ${err.message || err}`);
          totalErrors++;
        } finally {
          try { await pageLinkedin.close(); } catch {}
        }
      })());
    } else {
      onLog('⏩ LinkedIn dinonaktifkan di pengaturan.');
    }

    // ----------------------------------------------------
    // TAB 4: INDEED AUTOMATION
    // ----------------------------------------------------
    if (config.enableIndeed) {
      tasks.push((async () => {
        const pageIndeed = await getOrNewPage();
        await pageIndeed.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        const indeedLog = (msg: string) => onLog(`[Indeed] ${msg}`);

        indeedLog('🔍 Memulai proses bot Indeed di Tab khusus...');
        try {
          const metrics = await runIndeedBot(pageIndeed, config, indeedLog, indeedLimiter);
          totalAlreadyApplied += metrics.alreadyAppliedCount;
          totalErrors += metrics.errorCount;
        } catch (err: any) {
          indeedLog(`❌ Error: ${err.message || err}`);
          totalErrors++;
        } finally {
          try { await pageIndeed.close(); } catch {}
        }
      })());
    } else {
      onLog('⏩ Indeed dinonaktifkan di pengaturan.');
    }

    // ----------------------------------------------------
    // TAB 5: GLINTS STATUS SYNCHRONIZATION
    // ----------------------------------------------------
    if (config.syncGlintsStatus) {
      tasks.push((async () => {
        const pageSync = await getOrNewPage();
        await pageSync.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        const syncLog = (msg: string) => onLog(`[Glints Sync] ${msg}`);

        syncLog('🔄 Memulai sinkronisasi status lamaran Glints...');
        try {
          const { syncGlintsApplicationStatuses } = require('./bots/glints');
          const { updateGlintsApplicationStatuses } = require('./googleSheets');

          let totalSyncedUpdates = 0;
          const allDetails: Array<{ company: string; title: string; oldStatus: string; newStatus: string }> = [];

          const onBatchExtracted = async (batch: any[], pageNum: number) => {
            if (batch.length === 0) return;
            syncLog(`💾 [Batch Halaman ${pageNum}] Menyimpan progres (${batch.length} kartu terpindai) ke Google Sheets...`);
            const syncRes = await updateGlintsApplicationStatuses(batch, config);
            totalSyncedUpdates += syncRes.updatedCount;
            if (syncRes.details.length > 0) {
              allDetails.push(...syncRes.details);
              for (const d of syncRes.details) {
                syncLog(`   📌 ${d.company} - ${d.title}: "${d.oldStatus}" ➔ "${d.newStatus}"`);
              }
            }
            if (syncRes.updatedCount > 0) {
              syncLog(`💾 [Batch Halaman ${pageNum}] ${syncRes.updatedCount} status berhasil diperbarui di Google Sheets.`);
            } else {
              syncLog(`💾 [Batch Halaman ${pageNum}] Semua status pada batch ini sudah sesuai di Google Sheets.`);
            }
          };

          const apps = await syncGlintsApplicationStatuses(pageSync, syncLog, 200, onBatchExtracted);
          if (apps.length > 0) {
            syncLog(`📊 Selesai memindai seluruh riwayat (${apps.length} kartu). Memeriksa sinkronisasi akhir...`);
            const finalRes = await updateGlintsApplicationStatuses(apps, config);
            totalSyncedUpdates += finalRes.updatedCount;
            if (finalRes.details.length > 0) {
              allDetails.push(...finalRes.details);
              for (const d of finalRes.details) {
                syncLog(`   📌 ${d.company} - ${d.title}: "${d.oldStatus}" ➔ "${d.newStatus}"`);
              }
            }
            syncLog(
              `✅ Selesai Sinkronisasi Glints: Total ${totalSyncedUpdates} status diperbarui (${finalRes.matchedCount} lamaran cocok).`
            );
          } else {
            syncLog('ℹ️ Tidak ada kartu lamaran ditemukan di akun Glints.');
          }
        } catch (err: any) {
          syncLog(`⚠️ Gagal sinkronisasi status Glints: ${err.message || err}`);
        } finally {
          try { await pageSync.close(); } catch {}
        }
      })());
    }

    // ----------------------------------------------------
    // TAB 6: JOBSTREET STATUS SYNCHRONIZATION
    // ----------------------------------------------------
    if (config.syncJobstreetStatus) {
      tasks.push((async () => {
        const pageSync = await getOrNewPage();
        await pageSync.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        const syncLog = (msg: string) => onLog(`[Jobstreet Sync] ${msg}`);

        syncLog('🔄 Memulai sinkronisasi status lamaran Jobstreet...');
        try {
          const { syncJobstreetApplicationStatuses } = require('./bots/jobstreet');
          const { updateJobstreetApplicationStatuses } = require('./googleSheets');

          let totalSyncedUpdates = 0;
          const allDetails: Array<{ company: string; title: string; oldStatus: string; newStatus: string }> = [];

          const onBatchExtracted = async (batch: any[], pageNum: number) => {
            if (batch.length === 0) return;
            syncLog(`💾 [Batch Halaman ${pageNum}] Menyimpan progres (${batch.length} kartu terpindai) ke Google Sheets...`);
            const syncRes = await updateJobstreetApplicationStatuses(batch, config);
            totalSyncedUpdates += syncRes.updatedCount;
            if (syncRes.details.length > 0) {
              allDetails.push(...syncRes.details);
              for (const d of syncRes.details) {
                syncLog(`   📌 ${d.company} - ${d.title}: "${d.oldStatus}" ➔ "${d.newStatus}"`);
              }
            }
            if (syncRes.updatedCount > 0) {
              syncLog(`💾 [Batch Halaman ${pageNum}] ${syncRes.updatedCount} status berhasil diperbarui di Google Sheets.`);
            } else {
              syncLog(`💾 [Batch Halaman ${pageNum}] Semua status pada batch ini sudah sesuai di Google Sheets.`);
            }
          };

          const apps = await syncJobstreetApplicationStatuses(pageSync, syncLog, 100, onBatchExtracted);
          if (apps.length > 0) {
            syncLog(`📊 Selesai memindai seluruh riwayat (${apps.length} kartu). Memeriksa sinkronisasi akhir...`);
            const finalRes = await updateJobstreetApplicationStatuses(apps, config);
            totalSyncedUpdates += finalRes.updatedCount;
            if (finalRes.details.length > 0) {
              allDetails.push(...finalRes.details);
              for (const d of finalRes.details) {
                syncLog(`   📌 ${d.company} - ${d.title}: "${d.oldStatus}" ➔ "${d.newStatus}"`);
              }
            }
            syncLog(
              `✅ Selesai Sinkronisasi Jobstreet: Total ${totalSyncedUpdates} status diperbarui (${finalRes.matchedCount} lamaran cocok).`
            );
          } else {
            syncLog('ℹ️ Tidak ada kartu lamaran ditemukan di akun Jobstreet.');
          }
        } catch (err: any) {
          syncLog(`⚠️ Gagal sinkronisasi status Jobstreet: ${err.message || err}`);
        } finally {
          try { await pageSync.close(); } catch {}
        }
      })());
    }

    // Tunggu semua tab platform selesai bekerja
    if (tasks.length > 0) {
      onLog(`🚀 Menjalankan ${tasks.length} tugas/tab secara bersamaan...`);
      await Promise.allSettled(tasks);
    } else {
      onLog('⚠️ Tidak ada platform atau fitur pembaruan status yang diaktifkan di pengaturan.');
    }

    onLog('--------------------------------------------------');
    onLog('📊 RINGKASAN SESI (SESSION SUMMARY):');
    onLog(`✅ Total Berhasil Dilamar / Disimulasikan: ${totalSuccess} pekerjaan`);
    onLog(`⏩ Total Dilewati (Sudah Dilamar): ${totalAlreadyApplied} pekerjaan`);
    onLog(`❌ Total Error: ${totalErrors} pekerjaan`);
    onLog('--------------------------------------------------');
    onLog('🏁 Sesi CV Blaster Selesai!');
  } catch (error: any) {
    onLog(`🚨 Fatal Bot Error: ${error.message || error}`);
  } finally {
    if (browser) {
      if (mode === 'headful' && global.isBotRunning) {
        onLog('⏳ Menunggu 5 detik sebelum menutup browser headful...');
        await new Promise(r => setTimeout(r, 5000));
      }
      try {
        await browser.close();
      } catch {}
    }
    global.activeBotBrowser = null;
    global.isBotRunning = false;
  }
}
