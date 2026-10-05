import { NextResponse } from 'next/server';
import { spawn, execSync } from 'child_process';
import {
  findSystemChromePath,
  getProfilePath,
  cleanupStaleProfileLocks,
  terminateOrphanedProfileProcesses,
  syncProfileIfEmpty,
  launchBrowserWithFallback
} from '@/lib/browserHelper';
import { getConfig } from '@/lib/config';

declare global {
  var activeSetupBrowser: any;
  var activeSetupProcess: any;
}

export async function POST(request: Request) {
  try {
    const { action } = await request.json();
    const profilePath = getProfilePath();

    if (action === 'stop') {
      if (global.activeSetupProcess) {
        try {
          if (process.platform === 'win32') {
            execSync(`taskkill /pid ${global.activeSetupProcess.pid} /T /F`, { stdio: 'ignore' });
          } else {
            global.activeSetupProcess.kill();
          }
        } catch (e) {}
        global.activeSetupProcess = null;
      }

      if (global.activeSetupBrowser) {
        try {
          await global.activeSetupBrowser.close();
        } catch (e) {}
        global.activeSetupBrowser = null;
      }

      terminateOrphanedProfileProcesses(profilePath);
      cleanupStaleProfileLocks(profilePath);

      return NextResponse.json({ success: true, message: 'Browser login berhasil ditutup.' });
    }

    if (global.isBotRunning) {
      return NextResponse.json({
        success: false,
        error: 'Bot automasi sedang berjalan! Hentikan bot terlebih dahulu sebelum membuka Login Setup.'
      }, { status: 400 });
    }

    // Check if browser is already running
    if (global.activeSetupProcess) {
      try {
        process.kill(global.activeSetupProcess.pid, 0);
        return NextResponse.json({ success: false, error: 'Browser login sudah aktif. Silakan gunakan atau tutup terlebih dahulu.' }, { status: 400 });
      } catch {
        global.activeSetupProcess = null;
      }
    }

    if (global.activeSetupBrowser) {
      try {
        if (global.activeSetupBrowser.isConnected()) {
          return NextResponse.json({ success: false, error: 'Browser login sudah aktif. Silakan gunakan atau tutup terlebih dahulu.' }, { status: 400 });
        }
      } catch {
        global.activeSetupBrowser = null;
      }
    }

    // Sync any existing profiles from dev directory and clean up stale locks
    syncProfileIfEmpty();
    terminateOrphanedProfileProcesses(profilePath);
    cleanupStaleProfileLocks(profilePath);

    const config = getConfig();
    const customChrome = config.customChromePath ? config.customChromePath.trim() : '';
    const systemChrome = findSystemChromePath();
    const chromeExecutable = customChrome || systemChrome;

    // APPROACH 1: Launch Native Google Chrome
    // Launching official Google Chrome directly without CDP/automation flags eliminates Google's
    // "This browser or app may not be secure" block, allowing 100% successful Google Account login!
    if (config.useSystemChrome !== false && chromeExecutable) {
      try {
        const chromeArgs = [
          `--user-data-dir=${profilePath}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--window-size=1280,800',
          'https://glints.com/id',
          'https://www.jobstreet.co.id',
          'https://www.linkedin.com',
          'https://id.indeed.com'
        ];

        console.log(`[SetupLogin] Meluncurkan Google Chrome resmi: ${chromeExecutable}`);
        const child = spawn(chromeExecutable, chromeArgs, {
          detached: true,
          stdio: 'ignore'
        });

        child.on('exit', () => {
          console.log('[SetupLogin] Google Chrome setup browser ditutup.');
          global.activeSetupProcess = null;
        });

        child.on('error', (err) => {
          console.error('[SetupLogin] Google Chrome process error:', err);
          global.activeSetupProcess = null;
        });

        child.unref();
        global.activeSetupProcess = child;

        return NextResponse.json({
          success: true,
          message: 'Google Chrome resmi berhasil dibuka! Silakan login ke akun Google / Glints / Jobstreet / LinkedIn.'
        });
      } catch (chromeSpawnErr: any) {
        console.warn('[SetupLogin] Gagal meluncurkan Chrome native, beralih ke fallback Puppeteer:', chromeSpawnErr);
      }
    }

    // APPROACH 2: Fallback to Puppeteer Browser
    try {
      console.log('[SetupLogin] Meluncurkan browser melalui Puppeteer fallback...');
      const { browser } = await launchBrowserWithFallback('headful', (msg: string) => console.log(`[SetupLogin] ${msg}`));

      global.activeSetupBrowser = browser;

      const pages = await browser.pages();
      const page1 = pages[0] || await browser.newPage();
      page1.goto('https://glints.com/id', { waitUntil: 'domcontentloaded' }).catch(() => {});

      const page2 = await browser.newPage();
      page2.goto('https://www.jobstreet.co.id', { waitUntil: 'domcontentloaded' }).catch(() => {});

      const page3 = await browser.newPage();
      page3.goto('https://www.linkedin.com', { waitUntil: 'domcontentloaded' }).catch(() => {});

      const page4 = await browser.newPage();
      page4.goto('https://id.indeed.com', { waitUntil: 'domcontentloaded' }).catch(() => {});

      browser.on('disconnected', () => {
        global.activeSetupBrowser = null;
      });

      return NextResponse.json({ success: true, message: 'Browser login berhasil dibuka.' });
    } catch (fallbackError: any) {
      console.error('Error running setup browser fallback:', fallbackError);
      global.activeSetupBrowser = null;
      return NextResponse.json({ success: false, error: fallbackError.message || 'Gagal meluncurkan browser login.' }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  let isRunning = false;

  if (global.activeSetupProcess) {
    try {
      process.kill(global.activeSetupProcess.pid, 0);
      isRunning = true;
    } catch {
      isRunning = false;
      global.activeSetupProcess = null;
    }
  } else if (global.activeSetupBrowser) {
    try {
      isRunning = !!(global.activeSetupBrowser && global.activeSetupBrowser.isConnected());
    } catch {
      isRunning = false;
      global.activeSetupBrowser = null;
    }
  }

  return NextResponse.json({ isRunning });
}
