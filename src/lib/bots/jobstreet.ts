import { isJobAlreadyApplied, addAppliedJob } from '../googleSheets';
import { appendQuestionToCsv } from '../csvHelper';
import { answerQuestion } from '../questionAnswer';

export interface BotMetrics {
  successCount: number;
  alreadyAppliedCount: number;
  errorCount: number;
}

export async function runJobstreetBot(page: any, config: any, onLog: (msg: string) => void): Promise<BotMetrics> {
  let successCount = 0;
  let alreadyAppliedCount = 0;
  let errorCount = 0;

  onLog('🌐 Navigating to Jobstreet Homepage...');
  await page.goto('https://www.jobstreet.co.id/', { waitUntil: 'networkidle2', timeout: 60000 });

  const isLoggedIn = await page.evaluate(() => {
    return !!document.querySelector('[data-automation="user-menu"], a[href*="/profile"], button[aria-label*="Profile"]');
  });

  if (!isLoggedIn) {
    onLog('⚠️ Jobstreet: Not logged in! Please click "Buka Browser (Login Setup)" to login first.');
    return { successCount, alreadyAppliedCount, errorCount };
  }
  onLog('✅ Jobstreet: Logged in successfully.');

  const formattedKeywords = config.searchKeywords.trim().toLowerCase().replace(/\s+/g, '-');
  const formattedLocation = (config.location || '').trim().toLowerCase().replace(/\s+/g, '-');
  const searchUrl = formattedLocation 
    ? `https://id.jobstreet.com/${formattedKeywords}-jobs/in-${formattedLocation}`
    : `https://id.jobstreet.com/${formattedKeywords}-jobs`;

  onLog(`🔍 Searching Jobstreet: ${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: 'networkidle2' });

  // Get job links and active pagination page
  const pageData = await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll('a[data-automation="job-list-item-link-overlay"]'));
    const urls = Array.from(new Set(overlays.map((a: any) => a.href)));
    
    const activePageEl = document.querySelector('[aria-current="page"]');
    const currentPage = activePageEl ? activePageEl.textContent?.trim() || '1' : '1';
    
    return { urls, currentPage };
  });

  onLog(`📃 Bot is currently on page: ${pageData.currentPage}`);
  onLog(`📊 Found ${pageData.urls.length} job cards (overlay links) on Jobstreet.`);

  const jobUrls = pageData.urls;

  // Split job URLs into N workers chunks
  const numWorkers = config.concurrency || 3;
  const chunks: string[][] = Array.from({ length: numWorkers }, () => []);
  jobUrls.forEach((url: string, index: number) => {
    chunks[index % numWorkers].push(url);
  });

  const browser = page.browser();
  let totalSuccess = 0;
  let totalAlreadyApplied = 0;
  let totalErrors = 0;
  let totalAppliedCount = 0; // Shared limit count

  onLog(`🚀 Spawning ${numWorkers} parallel workers to process jobs concurrently...`);

  const workerPromises = chunks.map(async (chunkUrls, workerId) => {
    if (chunkUrls.length === 0) return;

    onLog(`👷 Worker ${workerId + 1} started to process ${chunkUrls.length} jobs.`);
    const workerPage = await browser.newPage();
    await workerPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await workerPage.setViewport({ width: 1280, height: 800 });

    for (const url of chunkUrls) {
      if (!global.isBotRunning) {
        onLog(`🛑 Worker ${workerId + 1}: Stop signal detected. Exiting worker.`);
        break;
      }

      if (totalAppliedCount >= (config.limitPerDay || 10)) {
        onLog(`🛑 Worker ${workerId + 1}: Reached daily limit (${config.limitPerDay} applies). Skipping remaining.`);
        break;
      }

      try {
        const alreadyApplied = await isJobAlreadyApplied(url);
        if (alreadyApplied) {
          onLog(`[Worker ${workerId + 1}] ⏩ Already applied (skipped): ${url}`);
          totalAlreadyApplied++;
          continue;
        }

        onLog(`[Worker ${workerId + 1}] 🔗 Opening Job: ${url}`);
        await workerPage.goto(url, { waitUntil: 'networkidle2' });
        await sleep(2000);

        // Extract Job Title & Company Name
        const jobDetails = await workerPage.evaluate(() => {
          const titleEl = document.querySelector('[data-automation="job-detail-title"]');
          const companyEl = document.querySelector('[data-automation="advertiser-name"]');
          
          const title = titleEl ? (titleEl.textContent || '').trim() : '';
          let company = '';
          if (companyEl) {
            company = companyEl.childNodes[0] ? (companyEl.childNodes[0].textContent || '').trim() : (companyEl.textContent || '').trim();
            company = company.replace(/\s+/g, ' ');
          }
          return { title, company };
        });

        onLog(`[Worker ${workerId + 1}] 💼 Job: "${jobDetails.title}" at "${jobDetails.company}"`);

        // Find and click Apply Now button on Jobstreet
        const applyBtnText = await workerPage.evaluate(() => {
          const applyBtn = document.querySelector('[data-automation="apply-now"], a[href*="/apply"]');
          return applyBtn ? (applyBtn.textContent || '').trim() : '';
        });

        if (/Applied|Dilamar/i.test(applyBtnText)) {
          onLog(`[Worker ${workerId + 1}] ⏩ Jobstreet detected already applied on site: ${url}`);
          await addAppliedJob({ 
            company: jobDetails.company || 'Jobstreet Company', 
            title: jobDetails.title || 'Jobstreet Job', 
            platform: 'Jobstreet', 
            jobUrl: url, 
            status: 'Already Applied' 
          });
          totalAlreadyApplied++;
          continue;
        }

        // Check if apply button exists and if it is an external redirect
        const applyBtnStatus = await workerPage.evaluate(() => {
          let btn = document.querySelector('[data-automation="apply-now"]') as HTMLElement;
          if (!btn) {
            const elements = Array.from(document.querySelectorAll('a, button'));
            btn = elements.find(el => /Apply|Lamar/i.test(el.textContent || '')) as HTMLElement;
          }
          if (!btn) return { exists: false, text: '', isExternal: false };

          const buttonText = (btn.textContent || 'Apply').trim();

          // Check for external link SVG icon inside the button
          const svgs = btn.querySelectorAll('svg');
          let isExternal = false;
          for (const svg of Array.from(svgs)) {
            const paths = svg.querySelectorAll('path');
            const hasExternalArrowPath = Array.from(paths).some(p => {
              const d = p.getAttribute('d') || '';
              return d.includes('M19 11') || d.includes('M21 3');
            });
            if (hasExternalArrowPath) {
              isExternal = true;
              break;
            }
          }

          return { exists: true, text: buttonText, isExternal };
        });

        if (!applyBtnStatus.exists) {
          onLog(`[Worker ${workerId + 1}] ❌ Apply button NOT found on page for: ${url}`);
          totalErrors++;
          continue;
        }

        if (applyBtnStatus.isExternal) {
          onLog(`[Worker ${workerId + 1}] ⏩ Jobstreet: External redirect apply button found ("${applyBtnStatus.text}"). Skipping.`);
          totalAlreadyApplied++;
          continue;
        }

        // Setup listener for new tab opening for this worker's tab specifically
        const newPagePromise = new Promise<any>(async (resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve(null);
          }, 4000);

          try {
            const listener = async (target: any) => {
              if (target.type() === 'page' && target.opener() === workerPage.target()) {
                clearTimeout(timeout);
                browser.off('targetcreated', listener);
                resolve(await target.page());
              }
            };
            browser.on('targetcreated', listener);
          } catch (e) {
            reject(e);
          }
        });

        // Click apply to open questionnaire
        await workerPage.evaluate(() => {
          let btn = document.querySelector('[data-automation="apply-now"]') as HTMLElement;
          if (!btn) {
            const elements = Array.from(document.querySelectorAll('a, button'));
            btn = elements.find(el => /Apply|Lamar/i.test(el.textContent || '')) as HTMLElement;
          }
          if (btn) btn.click();
        });

        // Determine which page contains the apply form (new tab or same tab)
        let applyPage = workerPage;
        try {
          const newTab = await newPagePromise;
          if (newTab) {
            applyPage = newTab;
            onLog(`[Worker ${workerId + 1}] 🟢 Application form opened in a new tab.`);
          } else {
            await sleep(2000);
            if (workerPage.url().includes('/apply')) {
              onLog(`[Worker ${workerId + 1}] 🟢 Application form opened on the same tab.`);
            }
          }
        } catch (e) {}

        // Handle the questionnaire flow
        let stepCount = 0;
        let reachedEnd = false;
        let lastStepName = '';
        let sameStepCount = 0;

        while (stepCount < 5 && !reachedEnd) {
          if (!global.isBotRunning) break;

          // Detect and log current step name
          const currentStepName = await applyPage.evaluate(() => {
            const activeStepEl = document.querySelector('[aria-current="step"]');
            return activeStepEl ? (activeStepEl.textContent || '').trim() : 'Unknown Step';
          });

          if (currentStepName === lastStepName) {
            sameStepCount++;
          } else {
            sameStepCount = 0;
            lastStepName = currentStepName;
          }

          if (sameStepCount >= 3) {
            throw new Error(`Stuck on step "${currentStepName}" for 3 consecutive clicks. Likely a validation error.`);
          }

          onLog(`[Worker ${workerId + 1}] 📍 Step: "${currentStepName}" (${stepCount + 1}/5)`);
          
          // Parse questions on this step
          const questionsOnStep = await applyPage.evaluate(() => {
            const stepData: Array<{ 
              id?: string;
              name?: string;
              question: string; 
              type: 'dropdown' | 'checklist' | 'radiobutton'; 
              options: string[] 
            }> = [];
            const labelElements = Array.from(document.querySelectorAll('label'));

            // 1. Parse select dropdowns
            const selectElements = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
            for (const selectEl of selectElements) {
              const selectId = selectEl.id;
              const labelEl = labelElements.find(l => l.getAttribute('for') === selectId) || selectEl.closest('div')?.querySelector('label');
              const questionText = labelEl ? (labelEl.textContent || '').trim() : 'Select option';
              const options = Array.from(selectEl.options).map(o => o.text.trim());
              stepData.push({ id: selectId, question: questionText, type: 'dropdown', options });
            }

            // 2. Parse checkbox groups
            const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
            const checkboxGroups: { [name: string]: HTMLInputElement[] } = {};
            
            for (const cb of checkboxes) {
              const name = cb.name || cb.getAttribute('data-testid') || 'unknown-checkbox';
              if (!checkboxGroups[name]) {
                checkboxGroups[name] = [];
              }
              checkboxGroups[name].push(cb);
            }

            for (const name in checkboxGroups) {
              const group = checkboxGroups[name];
              if (group.length === 0) continue;

              const firstCb = group[0];
              const parentContainer = firstCb.closest('fieldset, form, div[class*="a6x"], div[class*="a75"]');
              const strongEl = parentContainer ? parentContainer.querySelector('strong') : null;
              const questionText = strongEl ? (strongEl.textContent || '').trim() : 'Select options';

              const options: string[] = [];
              for (const cb of group) {
                const id = cb.id;
                const labelEl = labelElements.find(l => l.getAttribute('for') === id) || cb.closest('div')?.querySelector('label') as HTMLElement;
                const optionText = labelEl ? (labelEl.textContent || '').trim() : '';
                if (optionText) {
                  options.push(optionText);
                }
              }
              stepData.push({ name, question: questionText, type: 'checklist', options });
            }

            // 3. Parse radio button groups
            const radios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
            const radioGroups: { [name: string]: HTMLInputElement[] } = {};
            
            for (const rd of radios) {
              const name = rd.name || 'unknown-radio';
              if (!radioGroups[name]) {
                radioGroups[name] = [];
              }
              radioGroups[name].push(rd);
            }

            for (const name in radioGroups) {
              const group = radioGroups[name];
              if (group.length === 0) continue;

              const firstRd = group[0];
              const parentContainer = firstRd.closest('fieldset, form, div');
              const strongEl = parentContainer ? parentContainer.querySelector('strong') : null;
              const questionText = strongEl ? (strongEl.textContent || '').trim() : 'Select one option';

              const options: string[] = [];
              for (const rd of group) {
                const id = rd.id;
                const labelEl = labelElements.find(l => l.getAttribute('for') === id) || rd.closest('div')?.querySelector('label') as HTMLElement;
                const optionText = labelEl ? (labelEl.textContent || '').trim() : '';
                if (optionText) {
                  options.push(optionText);
                }
              }
              stepData.push({ name, question: questionText, type: 'radiobutton', options });
            }

            return stepData;
          });

          // Process and Answer each question dynamically
          for (const item of questionsOnStep) {
            if (item.options.length > 0) {
              onLog(`[Worker ${workerId + 1}] 📋 Found ${item.type.toUpperCase()}: "${item.question}" - Options: [${item.options.join(' | ')}]`);
              // Query Gemini / Regex answers
              const answers = await answerQuestion(item.question, item.options, item.type);
              onLog(`[Worker ${workerId + 1}] 🤖 AI Decision for "${item.question}": [${answers.join(' | ')}]`);
              appendQuestionToCsv(item.question, item.type, item.options, answers);

              // Apply chosen answers to the active applyPage DOM
              await applyPage.evaluate((qItem: any, chosenAnswers: string[]) => {
                const labelElements = Array.from(document.querySelectorAll('label'));

                if (qItem.type === 'dropdown' && qItem.id) {
                  const selectEl = document.getElementById(qItem.id) as HTMLSelectElement;
                  if (selectEl && chosenAnswers.length > 0) {
                    const targetText = chosenAnswers[0];
                    let targetIndex = 0;
                    for (let i = 0; i < selectEl.options.length; i++) {
                      if (selectEl.options[i].text.trim() === targetText) {
                        targetIndex = i;
                        break;
                      }
                    }
                    selectEl.selectedIndex = targetIndex;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                } else if (qItem.type === 'checklist' && qItem.name) {
                  const checkboxes = Array.from(document.querySelectorAll(`input[type="checkbox"][name="${qItem.name}"], input[type="checkbox"][data-testid^="${qItem.name}"]`)) as HTMLInputElement[];
                  for (const cb of checkboxes) {
                    const id = cb.id;
                    const labelEl = labelElements.find(l => l.getAttribute('for') === id) || cb.closest('div')?.querySelector('label') as HTMLElement;
                    const optionText = labelEl ? (labelEl.textContent || '').trim() : '';
                    const shouldBeChecked = chosenAnswers.some((ans: string) => optionText === ans);
                    if (shouldBeChecked !== cb.checked && labelEl) {
                      labelEl.click();
                    }
                  }
                } else if (qItem.type === 'radiobutton' && qItem.name) {
                  const radios = Array.from(document.querySelectorAll(`input[type="radio"][name="${qItem.name}"]`)) as HTMLInputElement[];
                  if (chosenAnswers.length > 0) {
                    const targetText = chosenAnswers[0];
                    for (const rd of radios) {
                      const id = rd.id;
                      const labelEl = labelElements.find(l => l.getAttribute('for') === id) || rd.closest('div')?.querySelector('label') as HTMLElement;
                      const optionText = labelEl ? (labelEl.textContent || '').trim() : '';
                      if (optionText === targetText && !rd.checked && labelEl) {
                        labelEl.click();
                        break;
                      }
                    }
                  }
                }
              }, item, answers);
            }
          }

          // Check for continue button
          const continueBtnText = await applyPage.evaluate(() => {
            let btn = document.querySelector('[data-testid="continue-button"]') as HTMLElement;
            if (!btn) {
              const buttons = Array.from(document.querySelectorAll('button'));
              btn = buttons.find(b => /Continue/i.test(b.textContent || '')) as HTMLElement;
            }
            return btn ? (btn.textContent || 'Continue').trim() : null;
          });

          if (continueBtnText) {
            await applyPage.evaluate(() => {
              let btn = document.querySelector('[data-testid="continue-button"]') as HTMLElement;
              if (!btn) {
                const buttons = Array.from(document.querySelectorAll('button'));
                btn = buttons.find(b => /Continue/i.test(b.textContent || '')) as HTMLElement;
              }
              if (btn) btn.click();
            });
            await sleep(4000); // Wait for next step
            stepCount++;
          } else {
            if (config.debugTest) {
              onLog(`[Worker ${workerId + 1}] 🏁 Reached final step (Submit/Review). Skipping actual submission.`);
              reachedEnd = true;
            } else {
              onLog(`[Worker ${workerId + 1}] 🚀 Reached the final step. Submitting application...`);
              const didSubmit = await applyPage.evaluate(() => {
                const submitBtn = document.querySelector('[data-testid="review-submit-application"]') as HTMLElement;
                if (submitBtn) {
                  submitBtn.click();
                  return true;
                }
                return false;
              });
              if (didSubmit) {
                onLog(`[Worker ${workerId + 1}] ✅ Submit application button clicked successfully!`);
                await sleep(5000); // Wait for confirmation page
              } else {
                onLog(`[Worker ${workerId + 1}] ❌ Failed to find or click Submit application button.`);
              }
              reachedEnd = true;
            }
          }
        }

        if (config.debugTest) {
          onLog(`[Worker ${workerId + 1}] ⏩ Finished checking questionnaire steps for: ${url}`);
          await addAppliedJob({
            company: jobDetails.company || 'Jobstreet Company',
            title: jobDetails.title || 'Jobstreet Job',
            platform: 'Jobstreet',
            jobUrl: url,
            status: 'Dry-run Sim'
          });
        } else {
          onLog(`[Worker ${workerId + 1}] ✅ Applied successfully to: ${url}`);
          await addAppliedJob({
            company: jobDetails.company || 'Jobstreet Company',
            title: jobDetails.title || 'Jobstreet Job',
            platform: 'Jobstreet',
            jobUrl: url,
            status: 'Success'
          });
        }
        
        totalSuccess++;
        totalAppliedCount++;

        // Clean up the application page/tab
        if (applyPage !== workerPage) {
          await applyPage.close();
        } else {
          // If same tab, navigate back to clean page
          await workerPage.goto('about:blank');
        }

        const delay = Math.floor(Math.random() * 3000) + 3000;
        await sleep(delay);

      } catch (itemError: any) {
        onLog(`[Worker ${workerId + 1}] ❌ Error applying to job ${url}: ${itemError.message || itemError}`);
        totalErrors++;
      }
    }

    await workerPage.close();
  });

  await Promise.all(workerPromises);

  return { successCount: totalSuccess, alreadyAppliedCount: totalAlreadyApplied, errorCount: totalErrors };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
