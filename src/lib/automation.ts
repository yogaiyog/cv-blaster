import path from 'path';
import { getConfig } from './config';
import { runGlintsBot } from './bots/glints';
import { runJobstreetBot } from './bots/jobstreet';

declare global {
  var isBotRunning: boolean;
}

export async function startBot(onLog: (msg: string) => void, mode: string = 'headless') {
  if (global.isBotRunning) {
    onLog('⚠️ Bot is already running!');
    return;
  }

  global.isBotRunning = true;
  onLog(`🚀 Starting CV Blaster Engine in ${mode.toUpperCase()} mode...`);

  let browser;
  try {
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    try {
      puppeteer.use(StealthPlugin());
    } catch (e) {}

    const config = getConfig();
    if (!config.searchKeywords) {
      throw new Error('Search keywords are not configured. Please fill them in first.');
    }

    const profilePath = path.join(process.cwd(), 'automation-profile');
    onLog('📂 Loading browser profile...');
    
    const isHeadless = mode !== 'headful';
    browser = await puppeteer.launch({
      headless: isHeadless,
      userDataDir: profilePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280,800'
      ],
      defaultViewport: isHeadless ? { width: 1280, height: 800 } : null
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    let totalSuccess = 0;
    let totalAlreadyApplied = 0;
    let totalErrors = 0;

    // ----------------------------------------------------
    // GLINTS AUTOMATION
    // ----------------------------------------------------
    if (config.enableGlints) {
      onLog('🔍 Checking Glints...');
      try {
        const metrics = await runGlintsBot(page, config, onLog);
        totalSuccess += metrics.successCount;
        totalAlreadyApplied += metrics.alreadyAppliedCount;
        totalErrors += metrics.errorCount;
      } catch (err: any) {
        onLog(`❌ Glints Error: ${err.message || err}`);
        totalErrors++;
      }
    } else {
      onLog('⏩ Glints is disabled in config.');
    }

    // ----------------------------------------------------
    // JOBSTREET AUTOMATION
    // ----------------------------------------------------
    if (config.enableJobstreet) {
      onLog('🔍 Checking Jobstreet...');
      try {
        const metrics = await runJobstreetBot(page, config, onLog);
        totalSuccess += metrics.successCount;
        totalAlreadyApplied += metrics.alreadyAppliedCount;
        totalErrors += metrics.errorCount;
      } catch (err: any) {
        onLog(`❌ Jobstreet Error: ${err.message || err}`);
        totalErrors++;
      }
    } else {
      onLog('⏩ Jobstreet is disabled in config.');
    }

    onLog('--------------------------------------------------');
    onLog('📊 SESSION SUMMARY:');
    onLog(`✅ Total Applied / Simulated: ${totalSuccess} pekerjaan`);
    onLog(`⏩ Total Skipped / Already Applied: ${totalAlreadyApplied} pekerjaan`);
    onLog(`❌ Total Errors: ${totalErrors} pekerjaan`);
    onLog('--------------------------------------------------');
    onLog('🏁 CV Blasting Session Finished successfully!');
  } catch (error: any) {
    onLog(`🚨 Fatal Bot Error: ${error.message || error}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    global.isBotRunning = false;
  }
}
