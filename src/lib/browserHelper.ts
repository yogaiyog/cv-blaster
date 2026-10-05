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

export function getProfilePath(): string {
  const baseDir = process.env.APP_USER_DATA || process.cwd();
  return path.join(baseDir, 'automation-profile');
}

/**
 * Searches for the official Google Chrome executable in standard system locations across Windows, macOS, and Linux.
 */
export function findSystemChromePath(): string | null {
  if (process.platform === 'win32') {
    const candidates = [
      process.env['LOCALAPPDATA'] ? path.join(process.env['LOCALAPPDATA'], 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
      process.env['PROGRAMFILES'] ? path.join(process.env['PROGRAMFILES'], 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
      process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ].filter(Boolean);

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  } else if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(process.env.HOME || '', 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  } else if (process.platform === 'linux') {
    const candidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/opt/google/chrome/chrome',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Automatically syncs the login profile from development folder to AppData if AppData profile is empty.
 */
export function syncProfileIfEmpty(): void {
  const baseDir = process.env.APP_USER_DATA;
  if (!baseDir) return;

  const targetProfile = path.join(baseDir, 'automation-profile');
  const candidateSources = [
    path.join(process.cwd(), 'automation-profile'),
    path.join('C:\\Users\\mieho\\Documents\\dev\\cv-blaster', 'automation-profile')
  ];

  for (const sourceProfile of candidateSources) {
    if (fs.existsSync(sourceProfile) && path.resolve(sourceProfile) !== path.resolve(targetProfile)) {
      const targetAccounts = path.join(targetProfile, 'Default', 'Accounts');
      const sourceAccounts = path.join(sourceProfile, 'Default', 'Accounts');

      if (!fs.existsSync(targetAccounts) && fs.existsSync(sourceAccounts)) {
        try {
          console.log(`[BrowserHelper] Menyalin profile login dari ${sourceProfile} ke AppData...`);
          fs.cpSync(sourceProfile, targetProfile, { recursive: true, force: false });
          console.log('[BrowserHelper] Berhasil menyalin profile login ke AppData!');
          break;
        } catch (e) {
          console.error('[BrowserHelper] Gagal menyalin profile:', e);
        }
      }
    }
  }
}

/**
 * Launches Puppeteer browser with priority given to official Google Chrome (System Chrome)
 * and automatically falls back to bundled Chromium if Google Chrome fails or is unavailable.
 * Both use the exact same persistent profile path (`automation-profile/`).
 */
declare const __non_webpack_require__: any;

export async function launchBrowserWithFallback(
  mode: 'headless' | 'headful' = 'headful',
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
      if (onLog) onLog(`[ERROR] ${msg}`);
      throw new Error(msg);
    }
  }

  try {
    puppeteer.use(StealthPlugin());
  } catch (e) {}

  syncProfileIfEmpty();
  const config = getConfig();
  const profilePath = getProfilePath();
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
        log(`[WARN] Terdeteksi sesi browser lama masih aktif atau lockfile tertinggal. Membersihkan proses & me-reset lock...`);
        terminateOrphanedProfileProcesses(profilePath, log);
        await new Promise((r) => setTimeout(r, 1200));
        cleanupStaleProfileLocks(profilePath);
        log(`[INFO] Mencoba meluncurkan kembali ${label}...`);
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
    const systemChromePath = findSystemChromePath();
    const finalChromePath = isCustomPath ? customPath : systemChromePath;

    const chromeOptions = {
      ...baseOptions,
      ...(finalChromePath ? { executablePath: finalChromePath } : { channel: 'chrome' })
    };

    const targetLabel = isCustomPath
      ? `Google Chrome (${customPath})`
      : finalChromePath
      ? `Google Chrome Resmi (${finalChromePath})`
      : 'Google Chrome Resmi (System Chrome)';

    try {
      log(`[INFO] Mencoba meluncurkan ${targetLabel}...`);
      const browser = await launchWithAutoRecovery(chromeOptions, targetLabel);
      const version = await browser.version().catch(() => 'Unknown');
      log(`[SUCCESS] Berhasil membuka ${targetLabel} [${version}]`);
      return {
        browser,
        browserType: isCustomPath ? 'custom-chrome' : 'google-chrome'
      };
    } catch (chromeError: any) {
      log(`[WARN] Gagal membuka ${targetLabel}: ${chromeError.message || chromeError}`);
      log(`[INFO] Beralih (fallback) menggunakan Chromium bawaan Puppeteer...`);
      cleanupStaleProfileLocks(profilePath);
    }
  }

  // ----------------------------------------------------
  // ATTEMPT 2: Fallback to Bundled Chromium
  // ----------------------------------------------------
  try {
    log(`[INFO] Meluncurkan Chromium Bawaan (Bundled Chromium)...`);
    const browser = await launchWithAutoRecovery(baseOptions, 'Chromium Bawaan');
    const version = await browser.version().catch(() => 'Unknown');
    log(`[SUCCESS] Berhasil membuka Chromium Bawaan [${version}]`);
    return {
      browser,
      browserType: 'chromium-bundled'
    };
  } catch (bundledError: any) {
    log(`[ERROR] Gagal meluncurkan browser: ${bundledError.message || bundledError}`);
    throw new Error(`Tidak dapat meluncurkan browser: ${bundledError.message || bundledError}`);
  }
}
