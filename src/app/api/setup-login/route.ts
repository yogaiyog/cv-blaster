import { NextResponse } from 'next/server';
import { spawn, execSync } from 'child_process';
import {
  findNativeBrowserPath,
  getProfilePath,
  cleanupStaleProfileLocks,
  terminateOrphanedProfileProcesses,
  syncProfileIfEmpty
} from '@/lib/browserHelper';
import { getConfig } from '@/lib/config';

declare global {
  var activeSetupProcess: any;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body.action || 'start';
    const targetUrl = body.url;
    const targetUrls = body.urls;
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

      terminateOrphanedProfileProcesses(profilePath);
      cleanupStaleProfileLocks(profilePath);

      return NextResponse.json({ success: true, message: 'Browser berhasil ditutup.' });
    }

    if (global.isBotRunning) {
      return NextResponse.json({
        success: false,
        error: 'Bot automasi sedang berjalan! Hentikan bot terlebih dahulu sebelum membuka browser.'
      }, { status: 400 });
    }

    const config = getConfig();
    const customBrowser = config.customChromePath ? config.customChromePath.trim() : '';
    const browserExecutable = customBrowser || findNativeBrowserPath();

    if (!browserExecutable) {
      return NextResponse.json({
        success: false,
        error: 'Browser tidak ditemukan di sistem. Pastikan Google Chrome atau Microsoft Edge terpasang.'
      }, { status: 404 });
    }

    // Check if browser process is already alive
    let isAlreadyRunning = false;
    if (global.activeSetupProcess) {
      try {
        process.kill(global.activeSetupProcess.pid, 0);
        isAlreadyRunning = true;
      } catch {
        global.activeSetupProcess = null;
      }
    }

    // If browser is already running
    if (isAlreadyRunning) {
      const urlsToOpen = (targetUrls && Array.isArray(targetUrls) && targetUrls.length > 0)
        ? targetUrls
        : targetUrl
        ? [targetUrl]
        : [];

      if (urlsToOpen.length > 0) {
        spawn(browserExecutable, [`--user-data-dir=${profilePath}`, ...urlsToOpen], {
          detached: true,
          stdio: 'ignore'
        }).unref();
        return NextResponse.json({
          success: true,
          message: 'Halaman portal berhasil dibuka di browser.'
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Browser sudah aktif.'
      });
    }

    // If browser is not running, launch fresh
    syncProfileIfEmpty();
    terminateOrphanedProfileProcesses(profilePath);
    cleanupStaleProfileLocks(profilePath);

    const browserArgs = [
      `--user-data-dir=${profilePath}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,800'
    ];

    if (targetUrls && Array.isArray(targetUrls) && targetUrls.length > 0) {
      browserArgs.push(...targetUrls);
    } else if (targetUrl) {
      browserArgs.push(targetUrl);
    }

    console.log(`[SetupLogin] Meluncurkan browser sistem: ${browserExecutable}`);
    const child = spawn(browserExecutable, browserArgs, {
      detached: true,
      stdio: 'ignore'
    });

    child.on('exit', () => {
      console.log('[SetupLogin] Browser ditutup.');
      global.activeSetupProcess = null;
    });

    child.on('error', (err) => {
      console.error('[SetupLogin] Error pada proses browser:', err);
      global.activeSetupProcess = null;
    });

    child.unref();
    global.activeSetupProcess = child;

    return NextResponse.json({
      success: true,
      message: 'Browser berhasil dibuka.'
    });
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
  }

  return NextResponse.json({ isRunning });
}
