import { isJobAlreadyApplied, addAppliedJob } from '../storage';
import { answerQuestion } from '../questionAnswer';

export interface BotMetrics {
  successCount: number;
  alreadyAppliedCount: number;
  errorCount: number;
}

export interface SharedLimiter {
  isLimitReached: (platformSuccess: number) => boolean;
  onJobSuccess: () => void;
  getTargetLimit: () => number;
}

export async function runJobstreetBot(
  page: any, 
  config: any, 
  onLog: (msg: string) => void,
  sharedLimiter?: SharedLimiter
): Promise<BotMetrics> {
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
    ? `https://id.jobstreet.com/id/${formattedKeywords}-jobs/in-${formattedLocation}`
    : `https://id.jobstreet.com/id/${formattedKeywords}-jobs`;

  const baseSearchUrl = searchUrl.replace(/[?&]page=\d+/, '');
  const urlSeparator = baseSearchUrl.includes('?') ? '&' : '?';

  let currentPage = 1;
  const targetLimit = sharedLimiter ? sharedLimiter.getTargetLimit() : (config.limitJobstreet || config.limitPerDay || 10);
  const checkLimitReached = () => sharedLimiter ? sharedLimiter.isLimitReached(successCount) : successCount >= targetLimit;
  const maxPages = Math.max(1, Math.ceil(targetLimit / 25) + 3);

  const processedUrls = new Set<string>();

  while (currentPage <= maxPages && global.isBotRunning !== false && !checkLimitReached()) {
    const pageSearchUrl = currentPage === 1 ? searchUrl : `${baseSearchUrl}${urlSeparator}page=${currentPage}`;
    onLog('==================================================');
    onLog(`📄 Membuka Halaman Pencarian Jobstreet ke-${currentPage}: ${pageSearchUrl}`);

    try {
      await page.goto(pageSearchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(2000);
    } catch (navErr: any) {
      onLog(`⚠️ Gagal membuka halaman Jobstreet ke-${currentPage}: ${navErr.message || navErr}`);
      break;
    }

    // Get job links and active pagination page
    const pageData = await page.evaluate(() => {
      const overlays = Array.from(document.querySelectorAll('a[data-automation="job-list-item-link-overlay"], a[data-automation="jobTitle"], a[href*="/job/"]'));
      const rawUrls = overlays.map((a: any) => a.href).filter(Boolean);
      
      const cleanUrls: string[] = [];
      for (const u of rawUrls) {
        try {
          const parsed = new URL(u);
          const clean = `${parsed.origin}${parsed.pathname}`;
          if (clean.includes('/job/') && !cleanUrls.includes(clean)) {
            cleanUrls.push(clean);
          }
        } catch {}
      }

      const activePageEl = document.querySelector('[aria-current="page"]');
      const pageNum = activePageEl ? activePageEl.textContent?.trim() || '1' : '1';
      
      return { urls: cleanUrls, currentPage: pageNum };
    });

    const newJobUrls = pageData.urls.filter((u: string) => !processedUrls.has(u));
    newJobUrls.forEach((u: string) => processedUrls.add(u));

    onLog(`📊 Halaman ${currentPage}: Ditemukan ${pageData.urls.length} lowongan unik (${newJobUrls.length} loker baru untuk diproses).`);

    if (newJobUrls.length === 0) {
      onLog(`⚠️ Tidak ada loker baru yang ditemukan pada halaman ke-${currentPage}. Selesai.`);
      break;
    }

    // Split job URLs into N workers chunks
    const numWorkers = Math.max(1, config.concurrency || 3);
    const chunks: string[][] = Array.from({ length: numWorkers }, () => []);
    newJobUrls.forEach((url: string, index: number) => {
      chunks[index % numWorkers].push(url);
    });

    const browser = page.browser();
    onLog(`🚀 Menjalankan ${numWorkers} worker concurrent untuk memproses ${newJobUrls.length} lowongan di Jobstreet halaman ${currentPage}...`);

    const workerPromises = chunks.map(async (chunkUrls, workerId) => {
      if (chunkUrls.length === 0) return;

      onLog(`👷 Worker ${workerId + 1} started to process ${chunkUrls.length} jobs.`);

      const workerPage = await browser.newPage();
      await workerPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
      await workerPage.setViewport({ width: 1280, height: 800 });

      try {
        for (const url of chunkUrls) {
          if (!global.isBotRunning) {
            onLog(`🛑 Worker ${workerId + 1}: Stop signal detected. Exiting worker.`);
            break;
          }

          if (checkLimitReached()) {
            onLog(`🛑 Worker ${workerId + 1}: Reached target limit (${successCount}/${targetLimit} applies). Skipping remaining.`);
            break;
          }

          const alreadyApplied = await isJobAlreadyApplied(url);
          if (alreadyApplied) {
            onLog(`[Worker ${workerId + 1}] ⏩ Already applied (skipped): ${url}`);
            alreadyAppliedCount++;
            continue;
          }

          let applyPage = workerPage;

          try {
          onLog(`[Worker ${workerId + 1}] 🔗 Opening Job: ${url}`);
          await workerPage.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
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

          // Find Apply button and verify status on Jobstreet
          const applyBtnStatus = await workerPage.evaluate(() => {
            const findApplyElement = (): HTMLElement | null => {
              // 1. Priority by data-automation attributes
              const prioritySelectors = [
                '[data-automation="job-detail-apply"]',
                '[data-automation="apply-now"]',
                '[data-automation="job-detail-apply-button"]',
                '[data-testid="apply-button"]',
                'a[href*="/apply"]'
              ];
              for (const sel of prioritySelectors) {
                const el = document.querySelector(sel) as HTMLElement;
                if (el) return el;
              }

              // 2. Priority by specific text ("Lamar Cepat", "Quick Apply", etc.)
              const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]')) as HTMLElement[];
              const exactMatch = candidates.find(el => {
                const txt = (el.textContent || '').trim();
                return /^(Lamar Cepat|Quick Apply|Lamar Sekarang|Apply Now)$/i.test(txt);
              });
              if (exactMatch) return exactMatch;

              // 3. Fallback text search for Apply/Lamar
              return candidates.find(el => {
                const txt = (el.textContent || '').trim();
                return /Lamar Cepat|Quick Apply|Lamar Sekarang|Apply Now/i.test(txt) || /^(Lamar|Apply)$/i.test(txt);
              }) || null;
            };

            const btn = findApplyElement();
            if (!btn) return { exists: false, text: '', isAlreadyApplied: false, isExternal: false, externalReason: '' };

            const buttonText = (btn.textContent || '').trim();
            const href = btn.getAttribute('href') || '';
            const target = btn.getAttribute('target') || '';

            // Check if already applied
            const isAlreadyApplied = /Applied|Dilamar|Sudah Dilamar/i.test(buttonText);

            // Check for external link icon (SVG path M19 11... M21 3...) or external indicators
            const hasExternalSvg = !!(
              btn.querySelector('svg path[d*="M19 11"], svg path[d*="M21 3"]') ||
              btn.querySelector('._1nyv0c0, .iqyw3t3f') ||
              btn.innerHTML.includes('M19 11c-.6 0-1') ||
              btn.innerHTML.includes('M21 3v-.4') ||
              btn.querySelector('svg')
            );

            const isDaftarBtn = /^daftar$/i.test(buttonText) ||
                               buttonText.toLowerCase().startsWith('daftar') ||
                               Array.from(btn.querySelectorAll('span')).some(s => (s.textContent || '').trim().toLowerCase() === 'daftar');

            const isDaftarOrApplyBtn = /^(daftar|apply)$/i.test(buttonText) ||
                                       /^(daftar|apply)\b/i.test(buttonText) ||
                                       Array.from(btn.querySelectorAll('span')).some(s => {
                                         const t = (s.textContent || '').trim().toLowerCase();
                                         return t === 'daftar' || t === 'apply';
                                       });

            const hasExternalKeywords = /situs perusahaan|company website|employer site|situs web|pendaftaran eksternal|register/i.test(buttonText);

            const isTargetBlank = target === '_blank';

            let isExternal = false;
            let externalReason = '';

            if (isDaftarOrApplyBtn && hasExternalSvg) {
              isExternal = true;
              externalReason = `Tombol pendaftaran eksternal "${buttonText}" dengan ikon panah tautan luar`;
            } else if (isDaftarBtn) {
              isExternal = true;
              externalReason = 'Tombol pendaftaran eksternal ("Daftar")';
            } else if (hasExternalSvg && !/Lamar Cepat|Quick Apply/i.test(buttonText)) {
              isExternal = true;
              externalReason = 'Memiliki ikon tautan eksternal (external link SVG)';
            } else if (hasExternalKeywords) {
              isExternal = true;
              externalReason = `Teks tombol mengindikasikan situs luar ("${buttonText}")`;
            } else if (isTargetBlank && !/Lamar Cepat|Quick Apply/i.test(buttonText)) {
              isExternal = true;
              externalReason = 'Tautan membuka di tab baru (target="_blank")';
            } else if (href.startsWith('http')) {
              try {
                const parsedUrl = new URL(href);
                const hostname = parsedUrl.hostname.toLowerCase();
                if (!hostname.includes('jobstreet') && !hostname.includes('seek')) {
                  isExternal = true;
                  externalReason = `Mengarahkan ke domain luar (${hostname})`;
                }
              } catch {}
            }

            // HANYA jika tombol murni bertuliskan "Lamar Cepat" / "Quick Apply" tanpa ikon tautan luar
            if (/^(Lamar Cepat|Quick Apply)$/i.test(buttonText) && !btn.innerHTML.includes('M19 11') && !isTargetBlank) {
              isExternal = false;
            }

            return { exists: true, text: buttonText, isAlreadyApplied, isExternal, externalReason };
          });

          if (!applyBtnStatus.exists) {
            onLog(`[Worker ${workerId + 1}] ❌ Tombol Lamar / Apply TIDAK ditemukan untuk: ${url}`);
            errorCount++;
            continue;
          }

          if (applyBtnStatus.isAlreadyApplied) {
            onLog(`[Worker ${workerId + 1}] ⏩ Jobstreet: Sudah pernah dilamar sebelumnya (${applyBtnStatus.text}): ${url}`);
            if (!config.debugTest) {
              await addAppliedJob({ 
                company: jobDetails.company || 'Jobstreet Company', 
                title: jobDetails.title || 'Jobstreet Job', 
                platform: 'Jobstreet', 
                jobUrl: url, 
                status: 'Already Applied' 
              });
            }
            alreadyAppliedCount++;
            continue;
          }

          if (applyBtnStatus.isExternal) {
            onLog(`[Worker ${workerId + 1}] ⏩ Jobstreet: Dilewati (${applyBtnStatus.externalReason || 'Pendaftaran Eksternal / "Daftar"'}): ${url}`);
            if (!config.debugTest) {
              await addAppliedJob({ 
                company: jobDetails.company || 'Jobstreet Company', 
                title: jobDetails.title || 'Jobstreet Job', 
                platform: 'Jobstreet', 
                jobUrl: url, 
                status: 'Skipped (External / Daftar)' 
              });
            }
            alreadyAppliedCount++;
            continue;
          }

          onLog(`[Worker ${workerId + 1}] 🖱️ Mengklik tombol "${applyBtnStatus.text || 'Lamar Cepat'}"...`);

          // Setup listener for new tab opening for this worker's tab specifically
          const newPagePromise = new Promise<any>(async (resolve, reject) => {
            const timeout = setTimeout(() => {
              resolve(null);
            }, 5000);

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
            const prioritySelectors = [
              '[data-automation="job-detail-apply"]',
              '[data-automation="apply-now"]',
              '[data-automation="job-detail-apply-button"]',
              '[data-testid="apply-button"]',
              'a[href*="/apply"]'
            ];
            let btn: HTMLElement | null = null;
            for (const sel of prioritySelectors) {
              btn = document.querySelector(sel) as HTMLElement;
              if (btn) break;
            }

            if (!btn) {
              const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]')) as HTMLElement[];
              btn = candidates.find(el => /Lamar Cepat|Quick Apply|Lamar Sekarang|Apply Now/i.test((el.textContent || '').trim())) || null;
            }

            if (btn) {
              const text = (btn.textContent || '').trim().toLowerCase();
              const hasExternal = text.startsWith('daftar') ||
                                  btn.innerHTML.includes('M19 11') ||
                                  btn.innerHTML.includes('M21 3');
              if (hasExternal) {
                return; // Safety guard: Do not click external Daftar button
              }
              btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
              btn.click();
            }
          });

          // Determine which page contains the apply form (new tab or same tab)
          let applyPage = workerPage;
          try {
            const newTab = await newPagePromise;
            if (newTab) {
              applyPage = newTab;
              onLog(`[Worker ${workerId + 1}] 🟢 Formulir lamaran terbuka di tab baru.`);
              await applyPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
            } else {
              await sleep(2500);
              if (workerPage.url().includes('/apply')) {
                onLog(`[Worker ${workerId + 1}] 🟢 Formulir lamaran terbuka di tab yang sama.`);
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
                const options = Array.from(selectEl.options)
                  .map(o => o.text.trim())
                  .filter(t => t.length > 0 && !/select|pilih|choose|--/i.test(t));
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
                let questionText = 'Select options';
                const parentSection = firstCb.closest('div[class*="a6x"], div[class*="a6t"], div[class*="a75"], fieldset');
                if (parentSection) {
                  const strongEl = parentSection.querySelector('strong');
                  if (strongEl) questionText = (strongEl.textContent || '').trim();
                }

                const options: string[] = [];
                for (const cb of group) {
                  const id = cb.id;
                  const labelEl = (id ? labelElements.find(l => l.getAttribute('for') === id) : null) || cb.closest('div')?.querySelector('label') as HTMLElement;
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
                let questionText = 'Select one option';
                const parentSection = firstRd.closest('div[class*="a6x"], div[class*="a6t"], div[class*="a75"], fieldset');
                if (parentSection) {
                  const strongEl = parentSection.querySelector('strong');
                  if (strongEl) questionText = (strongEl.textContent || '').trim();
                }

                const options: string[] = [];
                for (const rd of group) {
                  const id = rd.id;
                  const labelEl = (id ? labelElements.find(l => l.getAttribute('for') === id) : null) || rd.closest('div')?.querySelector('label') as HTMLElement;
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

                // Apply chosen answers to the active applyPage DOM
                await applyPage.evaluate((qItem: any, chosenAnswers: string[]) => {
                  const labelElements = Array.from(document.querySelectorAll('label'));

                  if (qItem.type === 'dropdown' && qItem.id) {
                    const selectEl = document.getElementById(qItem.id) as HTMLSelectElement;
                    if (selectEl && chosenAnswers.length > 0) {
                      const targetText = chosenAnswers[0];
                      let targetIndex = 0;
                      let found = false;
                      for (let i = 0; i < selectEl.options.length; i++) {
                        if (selectEl.options[i].text.trim() === targetText) {
                          targetIndex = i;
                          found = true;
                          break;
                        }
                      }
                      if (!found && selectEl.options.length > 1) {
                        const firstText = selectEl.options[0].text;
                        if (/select|pilih|choose|--/i.test(firstText)) {
                          targetIndex = 1;
                        }
                      }
                      selectEl.selectedIndex = targetIndex;
                      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                  } else if (qItem.type === 'checklist' && qItem.name) {
                    const inputs = Array.from(document.querySelectorAll(`input[name="${qItem.name}"]`)) as HTMLInputElement[];
                    for (const input of inputs) {
                      const id = input.id;
                      const label = (id ? labelElements.find(l => l.getAttribute('for') === id) : null) || input.closest('label');
                      const labelText = (label?.textContent || '').trim();

                      const shouldBeChecked = chosenAnswers.some(ans => 
                        labelText.toLowerCase() === ans.toLowerCase() ||
                        labelText.toLowerCase().includes(ans.toLowerCase()) || 
                        ans.toLowerCase().includes(labelText.toLowerCase())
                      );

                      const isCurrentlyChecked = input.checked || input.getAttribute('aria-checked') === 'true';

                      // Click ONLY ONCE if target state differs from current state!
                      if (shouldBeChecked && !isCurrentlyChecked) {
                        if (label && typeof (label as HTMLElement).click === 'function') {
                          (label as HTMLElement).click();
                        } else {
                          input.click();
                        }
                        input.checked = true;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                      } else if (!shouldBeChecked && isCurrentlyChecked) {
                        if (label && typeof (label as HTMLElement).click === 'function') {
                          (label as HTMLElement).click();
                        } else {
                          input.click();
                        }
                        input.checked = false;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                      }
                    }
                  } else if (qItem.type === 'radiobutton' && qItem.name) {
                    const inputs = Array.from(document.querySelectorAll(`input[name="${qItem.name}"]`)) as HTMLInputElement[];
                    for (const input of inputs) {
                      const id = input.id;
                      const label = (id ? labelElements.find(l => l.getAttribute('for') === id) : null) || input.closest('label');
                      const labelText = (label?.textContent || '').trim();
                      const isMatch = chosenAnswers.some(ans => 
                        labelText.toLowerCase() === ans.toLowerCase() ||
                        labelText.toLowerCase().includes(ans.toLowerCase()) || 
                        ans.toLowerCase().includes(labelText.toLowerCase())
                      );

                      if (isMatch) {
                        if (label && typeof (label as HTMLElement).click === 'function') {
                          (label as HTMLElement).click();
                        } else {
                          input.click();
                        }
                        input.checked = true;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        break;
                      }
                    }
                  }
                }, item, answers);
              }
            }

            // Check button state on active apply step
            const stepBtnStatus = await applyPage.evaluate(() => {
              // 1. Check for final submit button
              const submitBtn = (document.querySelector('[data-testid="review-submit-application"]') ||
                                Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).find(b => {
                                  const text = (b.textContent || b.getAttribute('value') || '').trim();
                                  return /^(Submit application|Submit Application|Kirim Lamaran|Submit)$/i.test(text);
                                })) as HTMLElement | null;

              if (submitBtn) {
                const disabled = submitBtn.hasAttribute('disabled') || submitBtn.getAttribute('aria-disabled') === 'true';
                return { isSubmit: true, isContinue: false, disabled, text: submitBtn.textContent?.trim() || 'Submit' };
              }

              // 2. Check for continue / next transition button
              const continueBtn = (document.querySelector('[data-testid="continue-button"]') ||
                                  Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).find(b => {
                                    const text = (b.textContent || b.getAttribute('value') || '').trim();
                                    return /^(Continue|Lanjutkan|Next|Selanjutnya|Review)$/i.test(text) || /Continue|Lanjutkan|Next/i.test(text);
                                  })) as HTMLElement | null;

              if (continueBtn) {
                const disabled = continueBtn.hasAttribute('disabled') || continueBtn.getAttribute('aria-disabled') === 'true';
                return { isSubmit: false, isContinue: true, disabled, text: continueBtn.textContent?.trim() || 'Continue' };
              }

              return { isSubmit: false, isContinue: false, disabled: false, text: '' };
            });

            if (stepBtnStatus.isSubmit) {
              if (config.debugTest) {
                onLog(`[Worker ${workerId + 1}] 🏁 [DEBUG MODE] Tombol "${stepBtnStatus.text}" terdeteksi.`);
                onLog(`[Worker ${workerId + 1}] 🛡️ Simulasi berhasil! Melewati pengiriman lamaran nyata ke Jobstreet.`);
                reachedEnd = true;
                break;
              } else {
                if (!stepBtnStatus.disabled) {
                  onLog(`[Worker ${workerId + 1}] 🚀 Mengirim lamaran resmi ke Jobstreet ("${stepBtnStatus.text}")...`);
                  await applyPage.evaluate(() => {
                    const submitBtn = (document.querySelector('[data-testid="review-submit-application"]') ||
                                      Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).find(b => {
                                        const text = (b.textContent || b.getAttribute('value') || '').trim();
                                        return /^(Submit application|Submit Application|Kirim Lamaran|Submit)$/i.test(text);
                                      })) as HTMLElement | null;
                    if (submitBtn) submitBtn.click();
                  });
                  await sleep(4000);
                }
                reachedEnd = true;
                break;
              }
            }

            if (stepBtnStatus.isContinue && !stepBtnStatus.disabled) {
              await applyPage.evaluate(() => {
                const continueBtn = (document.querySelector('[data-testid="continue-button"]') ||
                                    Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).find(b => {
                                      const text = (b.textContent || b.getAttribute('value') || '').trim();
                                      return /^(Continue|Lanjutkan|Next|Selanjutnya|Review)$/i.test(text) || /Continue|Lanjutkan|Next/i.test(text);
                                    })) as HTMLElement | null;
                if (continueBtn) continueBtn.click();
              });
              await sleep(3000);
              stepCount++;
            } else {
              reachedEnd = true;
              onLog(`[Worker ${workerId + 1}] ✅ Selesai menjawab seluruh pertanyaan.`);
              break;
            }
          }

          // Record job application outcome
          if (config.debugTest) {
            onLog(`[Worker ${workerId + 1}] 🧪 [Debug Mode] Simulasi selesai untuk "${jobDetails.title}". Data tidak disimpan ke riwayat agar dapat diuji kembali.`);
          } else {
            onLog(`[Worker ${workerId + 1}] 🎉 Berhasil melamar pekerjaan: ${jobDetails.title}`);
            await addAppliedJob({ 
              company: jobDetails.company || 'Jobstreet Company', 
              title: jobDetails.title || 'Jobstreet Job', 
              platform: 'Jobstreet', 
              jobUrl: url, 
              status: 'Applied' 
            });
          }
          
          successCount++;
          if (sharedLimiter) sharedLimiter.onJobSuccess();

          const delay = Math.floor(Math.random() * 3000) + 3000;
          await sleep(delay);

        } catch (itemError: any) {
          onLog(`[Worker ${workerId + 1}] ❌ Error applying to job ${url}: ${itemError.message || itemError}`);
          errorCount++;
        } finally {
          if (applyPage !== workerPage && !applyPage.isClosed()) {
            await applyPage.close().catch(() => {});
          }
        }
      }
    } finally {
      if (!workerPage.isClosed()) {
        await workerPage.close().catch(() => {});
      }
    }
  });

    await Promise.all(workerPromises);
    currentPage++;
  }

  return { successCount, alreadyAppliedCount, errorCount };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface JobstreetApplicationStatus {
  company: string;
  title: string;
  status: string;
  rawStatus?: string;
  location?: string;
  actionDate?: string;
}

export async function syncJobstreetApplicationStatuses(
  page: any,
  onLog: (msg: string) => void,
  maxPages: number = 100,
  onBatchExtracted?: (batch: JobstreetApplicationStatus[], pageNum: number) => Promise<void>
): Promise<JobstreetApplicationStatus[]> {
  const allApplications: JobstreetApplicationStatus[] = [];
  const seenKeys = new Set<string>();

  onLog('Memulai sinkronisasi status lamaran Jobstreet...');
  const baseUrl = 'https://id.jobstreet.com/id/my-activity/applied-jobs';
  onLog(`Membuka riwayat lamaran Jobstreet: ${baseUrl}`);

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    if (global.isBotRunning === false) {
      onLog('Proses sinkronisasi dihentikan oleh pengguna.');
      break;
    }

    const pageUrl = pageNum === 1 ? baseUrl : `${baseUrl}?page=${pageNum}`;
    onLog(`Memuat halaman ${pageNum} dari Jobstreet...`);

    try {
      await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(2500);

      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/sign-in') || currentUrl.includes('oauth')) {
        onLog('Sesi login Jobstreet tidak ditemukan. Silakan login terlebih dahulu melalui tombol "Buka Browser (Login Setup)".');
        throw new Error('Akun belum login ke Jobstreet. Silakan login melalui tombol "Buka Browser (Login Setup)" di Dashboard terlebih dahulu.');
      }

      // Scroll sedikit ke bawah untuk memicu lazy load
      await page.evaluate(() => {
        window.scrollBy(0, 800);
      });
      await sleep(1000);

      // Cek jumlah total lowongan jika ada di badge (misal: "93 lowongan")
      if (pageNum === 1) {
        const totalText = await page.evaluate(() => {
          const badge = document.querySelector('span[class*="11gsyt34"], h1 + span, [class*="my-activity"] span');
          return badge?.textContent?.trim() || '';
        });
        if (totalText) {
          onLog(`Ditemukan ringkasan total lamaran di Jobstreet: "${totalText}"`);
        }
      }

      // Tunggu hingga elemen kartu muncul
      try {
        await page.waitForSelector('div[data-automation^="job-item-"]', { timeout: 10000 });
      } catch {}

      const extractedCards: JobstreetApplicationStatus[] = await page.evaluate(() => {
        const results: JobstreetApplicationStatus[] = [];
        const cardElements = Array.from(document.querySelectorAll('div[data-automation^="job-item-"]'));

        for (const card of cardElements) {
          // 1. Job Title
          const titleEl = card.querySelector('h4 span[role="button"], h4 a, h4');
          let title = '';
          if (titleEl) {
            title = (titleEl.textContent || '')
              .replace(/^(?:Posisi Pekerjaan|Job Title)\s*/i, '')
              .trim();
          }

          // 2. Company Name
          let company = '';
          const allSpans = Array.from(card.querySelectorAll('span'));
          const companySpan = allSpans.find(s => /^(?:Perusahaan|Company)\s*/i.test((s.textContent || '').trim()));
          if (companySpan) {
            company = (companySpan.textContent || '')
              .replace(/^(?:Perusahaan|Company)\s*/i, '')
              .trim();
          } else {
            const h4Parent = card.querySelector('h4')?.parentElement;
            if (h4Parent) {
              const compCandidate = h4Parent.querySelector('span');
              if (compCandidate) {
                company = (compCandidate.textContent || '').replace(/^(?:Perusahaan|Company)\s*/i, '').trim();
              }
            }
          }

          // 3. Location
          let location = '';
          const locSpan = allSpans.find(s => /^(?:Lokasi|Location)\s*/i.test((s.textContent || '').trim()));
          if (locSpan) {
            location = (locSpan.textContent || '').replace(/^(?:Lokasi|Location)\s*/i, '').trim();
          }

          // 4. Status & Action Date
          let rawStatus = '';
          let actionDate = '';

          const statusEl = card.querySelector('span[class*="1e2wz161o"]') ||
                           card.querySelector('[class*="13uepok2b"] span') ||
                           card.querySelector('[data-automation="job-status"]');

          if (statusEl) {
            rawStatus = (statusEl.textContent || '').trim();
          }

          const dateEl = card.querySelector('span[class*="1e2wz161u"]') ||
                         card.querySelector('[class*="13uepok2b"] span:last-child');
          if (dateEl) {
            const clonedDate = dateEl.cloneNode(true) as HTMLElement;
            clonedDate.querySelectorAll('.zj7sl70, [aria-hidden="true"], span').forEach(s => s.remove());
            actionDate = (clonedDate.textContent || dateEl.textContent || '').trim();
          }

          // Normalisasi status ke format standar
          let normalizedStatus = 'Dilamar';
          const lowerRaw = rawStatus.toLowerCase();

          if (/tidak terpilih|tidak sesuai|unsuccessful|not suitable|rejected/i.test(lowerRaw)) {
            normalizedStatus = 'Tidak Sesuai';
          } else if (/terpilih|shortlisted|wawancara|interview/i.test(lowerRaw)) {
            normalizedStatus = 'Wawancara';
          } else if (/dilihat|ditilik|viewed|review|sedang ditinjau/i.test(lowerRaw)) {
            normalizedStatus = 'Dalam Review';
          } else if (/terkirim|submitted|membuka situs|opened.*site/i.test(lowerRaw)) {
            normalizedStatus = 'Dilamar';
          } else if (rawStatus) {
            normalizedStatus = rawStatus;
          }

          if (title || company) {
            results.push({
              company,
              title,
              status: normalizedStatus,
              rawStatus,
              location,
              actionDate
            });
          }
        }

        return results;
      });

      if (extractedCards.length === 0) {
        onLog(`Tidak ada kartu lamaran lagi di halaman ${pageNum}. Selesai memindai.`);
        break;
      }

      let newCardsOnThisPage = 0;
      for (const card of extractedCards) {
        const uniqueKey = `${card.company}_${card.title}`.toLowerCase();
        if (!seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey);
          allApplications.push(card);
          newCardsOnThisPage++;
        }
      }

      onLog(`Halaman ${pageNum}: Berhasil membaca ${extractedCards.length} kartu (${newCardsOnThisPage} kartu baru).`);

      if (newCardsOnThisPage === 0) {
        onLog(`Kartu di halaman ${pageNum} identik dengan halaman sebelumnya. Mengakhiri pemindaian.`);
        break;
      }

      // Cek tombol pagination Next
      const isLastPage = await page.evaluate(() => {
        const nextLink = document.querySelector('a[rel="next"]') as HTMLAnchorElement | null;
        if (!nextLink) return true;
        const parentLi = nextLink.closest('li');
        if (parentLi && parentLi.getAttribute('aria-hidden') === 'true') return true;
        if (nextLink.getAttribute('aria-hidden') === 'true' || nextLink.getAttribute('aria-disabled') === 'true') return true;
        return false;
      });

      // Update progres ke penyimpanan lokal setiap 5 halaman
      if (onBatchExtracted && pageNum % 5 === 0 && allApplications.length > 0) {
        try {
          await onBatchExtracted(allApplications, pageNum);
        } catch (batchErr: any) {
          onLog(`Kendala saat menyimpan batch progres ke penyimpanan lokal: ${batchErr.message || batchErr}`);
        }
      }

      if (isLastPage) {
        onLog(`Halaman ${pageNum} adalah halaman terakhir. Selesai memindai seluruh riwayat Jobstreet.`);
        break;
      }

      await sleep(1500);
    } catch (pageErr: any) {
      onLog(`Kendala saat memindai halaman ${pageNum}: ${pageErr.message || pageErr}`);
      break;
    }
  }

  onLog(`Total riwayat lamaran yang berhasil diekstrak dari Jobstreet: ${allApplications.length}`);
  return allApplications;
}

