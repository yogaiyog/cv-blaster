import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getConfig } from './config';

export interface LaunchBrowserResult {
  browser: any;
  browserType: 'google-chrome' | 'chromium-bundled' | 'custom-chrome';
}

/**
 * Terminates any orphaned Chrome or Chromium processes that are actively locking the profile directory.
 * Filters strictly by process name and command line containing the profile folder name.
 */
export function terminateOrphanedProfileProcesses(profilePath: string, onLog?: (msg: string) => void) {
  const log = onLog || console.log;
  const folderName = path.basename(profilePath) || 'automation-profile';

  try {
    if (process.platform === 'win32') {
      const psCommand = `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'chromium.exe') -and $_.CommandLine -like '*${folderName}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`;
      execSync(psCommand, { stdio: 'ignore', timeout: 5000 });
    } else {
      execSync(`pkill -f "${folderName}" || true`, { stdio: 'ignore', timeout: 5000 });
    }
  } catch (err: any) {
    // Non-fatal, ignore if no matching processes found
  }
}

/**
 * Removes stale Chromium/Chrome singleton lock symlinks and files if left over from a previous crash/close.
 * On Windows, Chrome creates 'lockfile' which causes Puppeteer to throw:
 * "The browser is already running for ... Use a different `userDataDir` or stop the running browser first."
 */
export function cleanupStaleProfileLocks(profilePath: string) {
  try {
    const lockFiles = [
      'SingletonLock',
      'SingletonCookie',
      'SingletonSocket',
      'DevToolsActivePort',
      'lockfile',
      'parent.lock'
    ];
    for (const file of lockFiles) {
      try {
        const filePath = path.join(/*turbopackIgnore: true*/ profilePath, file);
        if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {}
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Launches Puppeteer browser with priority given to official Google Chrome (System Chrome)
 * and automatically falls back to bundled Chromium if Google Chrome fails or is unavailable.
 * Both use the exact same persistent profile path (`automation-profile/`).
 */
declare const __non_webpack_require__: any;

export async function launchBrowserWithFallback(
  mode: 'headless' | 'headful' = 'headless',
  onLog?: (msg: string) => void
): Promise<LaunchBrowserResult> {
  let puppeteer: any;
  let StealthPlugin: any;
  try {
    puppeteer = require('puppeteer-extra');
    StealthPlugin = require('puppeteer-extra-plugin-stealth');
  } catch (err: any) {
    try {
      puppeteer = typeof __non_webpack_require__ !== 'undefined'
        ? __non_webpack_require__('puppeteer-extra')
        : (eval('require') as NodeRequire)('puppeteer-extra');
      StealthPlugin = typeof __non_webpack_require__ !== 'undefined'
        ? __non_webpack_require__('puppeteer-extra-plugin-stealth')
        : (eval('require') as NodeRequire)('puppeteer-extra-plugin-stealth');
    } catch (fallbackErr: any) {
      const msg = `Gagal memuat modul otomatisasi (puppeteer-extra): ${err?.message || err}. Pastikan dependensi terpasang lengkap di instalasi aplikasi.`;
      if (onLog) onLog(`🚨 ${msg}`);
      throw new Error(msg);
    }
  }

  try {
    puppeteer.use(StealthPlugin());
  } catch (e) {}

  const config = getConfig();
  const baseDir = process.env.APP_USER_DATA || process.cwd();
  const profilePath = path.join(baseDir, 'automation-profile');
  const isHeadless = mode !== 'headful';

  const log = onLog || console.log;

  // Bersihkan stale singleton lock sebelum meluncurkan browser
  cleanupStaleProfileLocks(profilePath);

  const baseArgs = [
    '--no-default-browser-check',
    '--no-first-run',
    '--disable-infobars',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1280,800',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
  ];

  // Hanya tambahkan sandbox flags khusus Linux jika dijalankan di container/server Linux
  if (process.platform === 'linux') {
    baseArgs.push('--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage');
  }

  const baseOptions: any = {
    headless: isHeadless,
    userDataDir: profilePath,
    ignoreDefaultArgs: ['--enable-automation'],
    args: baseArgs,
    defaultViewport: isHeadless ? { width: 1280, height: 800 } : null
  };

  /**
   * Helper to launch Puppeteer with automatic recovery if a profile conflict occurs
   */
  const launchWithAutoRecovery = async (options: any, label: string) => {
    try {
      cleanupStaleProfileLocks(profilePath);
      return await puppeteer.launch(options);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (
        errMsg.includes('already running') ||
        errMsg.includes('ProcessSingleton') ||
        errMsg.includes('lockfile')
      ) {
        log(`⚠️ Terdeteksi sesi browser lama masih aktif atau lockfile tertinggal. Membersihkan proses & me-reset lock...`);
        terminateOrphanedProfileProcesses(profilePath, log);
        await new Promise((r) => setTimeout(r, 1200));
        cleanupStaleProfileLocks(profilePath);
        log(`🔄 Mencoba meluncurkan kembali ${label}...`);
        return await puppeteer.launch(options);
      }
      throw err;
    }
  };

  // ----------------------------------------------------
  // ATTEMPT 1: Official Google Chrome (System Chrome)
  // ----------------------------------------------------
  if (config.useSystemChrome !== false) {
    const customPath = config.customChromePath ? config.customChromePath.trim() : '';
    const isCustomPath = customPath.length > 0;
    const chromeOptions = {
      ...baseOptions,
      ...(isCustomPath ? { executablePath: customPath } : { channel: 'chrome' })
    };

    const targetLabel = isCustomPath
      ? `Google Chrome (${customPath})`
      : 'Google Chrome Resmi (System Chrome)';

    try {
      log(`🌐 Mencoba meluncurkan ${targetLabel}...`);
      const browser = await launchWithAutoRecovery(chromeOptions, targetLabel);
      const version = await browser.version().catch(() => 'Unknown');
      log(`✅ Berhasil membuka ${targetLabel} [${version}]`);
      return {
        browser,
        browserType: isCustomPath ? 'custom-chrome' : 'google-chrome'
      };
    } catch (chromeError: any) {
      log(`⚠️ Gagal membuka ${targetLabel}: ${chromeError.message || chromeError}`);
      log(`🔄 Beralih (fallback) menggunakan Chromium bawaan Puppeteer...`);
      cleanupStaleProfileLocks(profilePath);
    }
  }

  // ----------------------------------------------------
  // ATTEMPT 2: Fallback to Bundled Chromium
  // ----------------------------------------------------
  try {
    log(`🌐 Meluncurkan Chromium Bawaan (Bundled Chromium)...`);
    const browser = await launchWithAutoRecovery(baseOptions, 'Chromium Bawaan');
    const version = await browser.version().catch(() => 'Unknown');
    log(`✅ Berhasil membuka Chromium Bawaan [${version}]`);
    return {
      browser,
      browserType: 'chromium-bundled'
    };
  } catch (bundledError: any) {
    log(`🚨 Gagal meluncurkan browser: ${bundledError.message || bundledError}`);
    throw new Error(`Tidak dapat meluncurkan browser: ${bundledError.message || bundledError}`);
  }
}
