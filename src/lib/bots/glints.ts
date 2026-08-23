import { isJobAlreadyApplied, addAppliedJob } from '../googleSheets';

export interface BotMetrics {
  successCount: number;
  alreadyAppliedCount: number;
  errorCount: number;
}

export async function runGlintsBot(page: any, config: any, onLog: (msg: string) => void): Promise<BotMetrics> {
  let successCount = 0;
  let alreadyAppliedCount = 0;
  let errorCount = 0;

  onLog('🌐 Navigating to Glints Dashboard...');
  await page.goto('https://glints.com/id/dashboard', { waitUntil: 'networkidle2', timeout: 60000 });

  // Check login
  const isLoggedIn = await page.evaluate(() => {
    return !!document.querySelector('[class*="Avatar"], [class*="avatar"], a[href*="/dashboard"]');
  });

  if (!isLoggedIn) {
    onLog('⚠️ Glints: Not logged in! Please click "Buka Browser (Login Setup)" to login first.');
    return { successCount, alreadyAppliedCount, errorCount };
  }
  onLog('✅ Glints: Logged in successfully.');

  // Navigate to job search page
  const searchUrl = `https://glints.com/id/opportunities/jobs?keyword=${encodeURIComponent(config.searchKeywords)}&location=${encodeURIComponent(config.location || '')}`;
  onLog(`🔍 Searching Glints: ${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: 'networkidle2' });

  // Get job links
  const jobUrls = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/opportunities/jobs/"]'));
    return Array.from(new Set(anchors.map((a: any) => a.href)));
  });

  onLog(`Found ${jobUrls.length} job opportunities on Glints.`);

  let appliedCount = 0;
  for (const url of jobUrls) {
    if (!global.isBotRunning) {
      onLog('🛑 Glints: Stop signal detected. Exiting loop.');
      break;
    }

    if (appliedCount >= (config.limitPerDay || 10)) {
      onLog('Reached daily apply limit for Glints.');
      break;
    }

    try {
      const alreadyApplied = await isJobAlreadyApplied(url);
      if (alreadyApplied) {
        onLog(`⏩ Already applied (skipped): ${url}`);
        alreadyAppliedCount++;
        continue;
      }

      onLog(`🔗 Opening Job: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2' });
      await sleep(2000);

      // Check if already applied on page (e.g. button says "Applied" or similar)
      const buttonText = await page.evaluate(() => {
        const applyBtn = document.querySelector('button[class*="ApplyButton"], [class*="apply-button"], button[type="button"]');
        return applyBtn ? (applyBtn.textContent || '').trim() : '';
      });

      if (/Applied|Melamar|Sudah Dilamar/i.test(buttonText)) {
        onLog(`⏩ Glints detected already applied on site: ${url}`);
        await addAppliedJob({ company: 'Glints Job', title: 'Glints Listing', platform: 'Glints', jobUrl: url, status: 'Already Applied' });
        alreadyAppliedCount++;
        continue;
      }

      const hasApplyButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const target = buttons.find(b => /Apply|Lamar/i.test(b.textContent || ''));
        return target ? (target.textContent || 'Apply Button').trim() : null;
      });

      if (hasApplyButton) {
        onLog(`🔍 [DEBUG] Apply button found on page: "${hasApplyButton}"`);
      } else {
        onLog(`❌ [DEBUG] Apply button NOT found on page for: ${url}`);
        errorCount++;
        continue;
      }

      if (config.debugTest) {
        onLog(`⏩ [DEBUG] Dry-run: Skipping actual apply action for: ${url}`);
        await addAppliedJob({
          company: 'Glints Debug Co',
          title: (await page.title()).replace(' - Glints', ''),
          platform: 'Glints',
          jobUrl: url,
          status: 'Dry-run Sim'
        });
        successCount++;
        appliedCount++;
        continue;
      } else {
        onLog(`🚀 Clicking apply button for: ${url}`);
        const didClick = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const target = buttons.find(b => /Apply|Lamar/i.test(b.textContent || ''));
          if (target) {
            target.click();
            return true;
          }
          return false;
        });

        if (!didClick) {
          onLog(`❌ Apply button not found/clickable on Glints: ${url}`);
          errorCount++;
          continue;
        }

        onLog('⏳ Waiting for Glints application step...');
        await sleep(3000);

        // Handle modals, questionnaire, or "submit" button in Glints application dialog
        const didSubmit = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const submitBtn = buttons.find(b => /Submit|Kirim Lamaran|Confirm/i.test(b.textContent || ''));
          if (submitBtn) {
            submitBtn.click();
            return true;
          }
          return false;
        });

        if (didSubmit) {
          onLog('✅ Submit button clicked in Glints dialog.');
          await sleep(2000);
        }

        const pageTitle = await page.title();
        onLog(`✅ Applied successfully to: ${pageTitle}`);
        await addAppliedJob({
          company: 'Glints Company',
          title: pageTitle.replace(' - Glints', ''),
          platform: 'Glints',
          jobUrl: url,
          status: 'Success'
        });

        successCount++;
        appliedCount++;
        const delay = Math.floor(Math.random() * 5000) + 5000;
        await sleep(delay);
      }

    } catch (itemError: any) {
      onLog(`❌ Error applying to job ${url}: ${itemError.message || itemError}`);
      errorCount++;
    }
  }

  return { successCount, alreadyAppliedCount, errorCount };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
