import { isJobAlreadyApplied, addAppliedJob } from '../googleSheets';
import { appendQuestionToCsv } from '../csvHelper';
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

export async function runIndeedBot(
  page: any,
  config: any,
  onLog: (msg: string) => void,
  sharedLimiter?: SharedLimiter
): Promise<BotMetrics> {
  let successCount = 0;
  let alreadyAppliedCount = 0;
  let errorCount = 0;

  try {
    const keyword = (config.searchKeywords || 'fullstack').trim();
    const location = (config.location || 'Jakarta').trim();

    // 1. Bentuk URL Pencarian Langsung Indeed
    const searchParams = new URLSearchParams();
    if (keyword) searchParams.set('q', keyword);
    if (location) searchParams.set('l', location);
    searchParams.set('radius', '25');
    searchParams.set('from', 'searchOnDesktopSerp');

    const searchUrl = `https://id.indeed.com/jobs?${searchParams.toString()}`;
    onLog(`🌐 Membuka URL Pencarian Indeed: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3500);

    // 2. Pengecekan status login
    const isLoggedIn = await page.evaluate(() => {
      const navAccount = document.querySelector('[data-gnav-element-name="AccountMenu"], #gnav-account-container, .gnav-AccountMenu, a[href*="/account"], button[aria-label*="Account"], button[aria-label*="Akun"]');
      const signInBtn = document.querySelector('a[href*="/account/login"], a[href*="secure.indeed.com/auth"]');
      return !!navAccount || !signInBtn;
    });

    const currentUrl = page.url();
    if (currentUrl.includes('/account/login') || currentUrl.includes('/auth') || !isLoggedIn) {
      onLog('⚠️ Indeed: Belum login! Silakan klik tombol "Buka Browser (Login Setup)" di Dashboard untuk login Indeed terlebih dahulu.');
      return { successCount, alreadyAppliedCount, errorCount };
    }

    onLog('✅ Indeed: Akun terverifikasi dan sesi login aktif.');

    // Tunggu hasil pencarian selesai dimuat
    onLog('⏳ Menunggu hasil pencarian Indeed dimuat...');
    try {
      await page.waitForFunction(() => {
        const cards = document.querySelectorAll('.job_seen_beacon, .cardOutline, a.jcs-JobTitle, [data-jk]');
        return cards.length > 0;
      }, { timeout: 15000 });
    } catch {
      await sleep(3000);
    }
    await sleep(1500);

    const targetLimit = sharedLimiter ? sharedLimiter.getTargetLimit() : (config.limitIndeed || config.limitPerDay || 50);
    const checkLimitReached = () => sharedLimiter ? sharedLimiter.isLimitReached(successCount) : successCount >= targetLimit;

    let currentPage = 1;
    const maxPages = Math.max(1, Math.ceil(targetLimit / 10) + 3);
    const processedJobIds = new Set<string>();

    const browser = page.browser();

    while (currentPage <= maxPages && global.isBotRunning && !checkLimitReached()) {
      onLog('==================================================');
      onLog(`📄 Memproses Halaman Pencarian Indeed ke-${currentPage}...`);

      // 3. Scan seluruh Job ID unik pada daftar pencarian
      const jobCards = await page.evaluate(() => {
        const results: { jobId: string; title: string; company: string; location: string; isEasyApply: boolean; isAlreadyApplied: boolean }[] = [];
        const cardElements = Array.from(document.querySelectorAll('.job_seen_beacon, .cardOutline, table.mainContentTable, li.css-1ac2h1w, li.css-5lfssm'));

        for (const el of cardElements) {
          const titleAnchor = el.querySelector('a.jcs-JobTitle, h3.jobTitle a, a[data-jk]') as HTMLAnchorElement;
          const jobId = titleAnchor?.getAttribute('data-jk') || el.closest('[data-jk]')?.getAttribute('data-jk') || el.getAttribute('data-jk') || '';
          if (!jobId) continue;

          // Hindari duplikasi dalam list yang sama
          if (results.some(r => r.jobId === jobId)) continue;

          const title = titleAnchor?.textContent?.trim() || el.querySelector('h3.jobTitle span, h2.jobTitle span')?.textContent?.trim() || 'Lowongan Kerja';
          const companyEl = el.querySelector('[data-testid="company-name"], .companyName, .css-19eicqx');
          const company = companyEl?.textContent?.trim() || 'Perusahaan';

          const locEl = el.querySelector('[data-testid="text-location"], .companyLocation, .css-1f06pz4');
          const location = locEl?.textContent?.trim() || 'Jakarta';

          const elText = el.textContent || '';
          const isEasyApply = /Easily apply|Lamar dengan Cepat|Lamar Mudah|Apply with Indeed/i.test(elText) || !!el.querySelector('.iaIcon, .ialbl');
          const isAlreadyApplied = /Dilamar|Applied|Lamaran terkirim/i.test(elText);

          results.push({
            jobId,
            title,
            company,
            location,
            isEasyApply,
            isAlreadyApplied
          });
        }
        return results;
      });

      onLog(`📊 Panel Kiri Indeed: Terdeteksi ${jobCards.length} lowongan kerja pada halaman ini.`);

      if (jobCards.length === 0) {
        onLog('⚠️ Tidak ditemukan kartu lowongan kerja di halaman ini. Mencoba menyelesaikan.');
        break;
      }

      // 4. Iterasi setiap lowongan
      for (let i = 0; i < jobCards.length; i++) {
        const cardInfo = jobCards[i];
        if (!cardInfo || !cardInfo.jobId) continue;

        if (!global.isBotRunning) {
          onLog('🛑 Bot dihentikan oleh pengguna.');
          break;
        }

        if (checkLimitReached()) {
          onLog(`🎯 Batas kuota tercapai (${successCount}/${targetLimit}). Selesai.`);
          break;
        }

        if (processedJobIds.has(cardInfo.jobId)) {
          continue;
        }
        processedJobIds.add(cardInfo.jobId);

        const targetJobUrl = `https://id.indeed.com/viewjob?jk=${cardInfo.jobId}`;

        // Cek riwayat Google Sheets
        const alreadyInSheets = await isJobAlreadyApplied(targetJobUrl);
        if (alreadyInSheets) {
          onLog(`⏩ [${i + 1}/${jobCards.length}] Lowongan "${cardInfo.title}" - Sudah tercatat di riwayat Google Sheets. Melewati...`);
          alreadyAppliedCount++;
          continue;
        }

        if (cardInfo.isAlreadyApplied) {
          onLog(`⏩ [${i + 1}/${jobCards.length}] Lowongan "${cardInfo.title}" - Sudah ada label 'Dilamar / Applied' pada kartu.`);
          alreadyAppliedCount++;
          continue;
        }

        onLog('==================================================');
        onLog(`💼 [${i + 1}/${jobCards.length}] Lowongan: "${cardInfo.title}"`);
        onLog(`🏢 Perusahaan: "${cardInfo.company}" | 📍 ${cardInfo.location}`);
        onLog(`🔗 URL: ${targetJobUrl}`);

        // Klik kartu untuk membuka panel kanan (Right Pane)
        await page.evaluate((jobId: string) => {
          const anchor = document.querySelector(`a[data-jk="${jobId}"], a.jcs-JobTitle[data-jk="${jobId}"], a#job_${jobId}`) as HTMLElement;
          const container = anchor?.closest('.job_seen_beacon, .cardOutline') as HTMLElement || anchor;
          if (container) {
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (anchor) anchor.click();
          }
        }, cardInfo.jobId);
        await sleep(2500);

        // Periksa komponen panel kanan / detail lowongan
        const detailInfo = await page.evaluate(() => {
          // Cari tombol / link Indeed Apply (Smart Apply)
          const applyEl = document.querySelector(
            '[data-testid="viewjob-indeed-apply"], [data-testid="primary-apply-action"] a, a[href*="smartapply.indeed.com"], a[href*="indeedapply"], button#indeedApplyButton, [data-testid="indeedApplyButton"], button[aria-label*="Lamar dengan Indeed"], button[aria-label*="Apply now"], button[aria-label*="Lamar sekarang"]'
          ) as HTMLElement | null;

          const externalBtn = document.querySelector(
            'button[aria-label*="Lamar di situs web"], button[aria-label*="Apply on company site"], a[aria-label*="Apply on company site"], a[href*="rc/clk"]'
          );

          const titleEl = document.querySelector('[data-testid="vj-job-title"], [data-testid="vj-job-title-compact"], .jobsearch-JobInfoHeader-title, h5[aria-level="5"]');
          const officialTitle = titleEl?.textContent?.trim() || '';

          const companyEl = document.querySelector('[data-testid="company-info-metadata"] a, [data-testid="inlineHeader-companyName"] a, [data-testid="inlineHeader-companyName"]');
          const officialCompany = companyEl?.textContent?.trim() || '';

          const applyHref = applyEl && (applyEl as HTMLAnchorElement).href ? (applyEl as HTMLAnchorElement).href : '';

          return {
            hasIndeedApply: !!applyEl,
            applyHref,
            isExternal: !!externalBtn && !applyEl,
            officialTitle,
            officialCompany,
            btnText: applyEl ? applyEl.textContent?.trim() : ''
          };
        });

        const activeTitle = detailInfo?.officialTitle || cardInfo.title;
        const activeCompany = detailInfo?.officialCompany || cardInfo.company;

        if (!detailInfo || !detailInfo.hasIndeedApply) {
          if (detailInfo?.isExternal) {
            onLog(`⏩ Melewati "${activeTitle}" - Memerlukan redirect ke situs eksternal perusahaan.`);
          } else {
            onLog(`⏩ Melewati "${activeTitle}" - Tombol 'Lamar dengan Indeed / Apply now' tidak tersedia.`);
          }
          continue;
        }

        onLog(`🔘 Terdeteksi tombol "Apply now / Lamar dengan Indeed" untuk "${activeTitle}"!`);

        // Jalankan proses Apply Form
        let applyPage: any = null;

        try {
          if (detailInfo.applyHref && detailInfo.applyHref.includes('smartapply.indeed.com')) {
            onLog(`🌐 Membuka halaman Smart Apply Indeed: ${detailInfo.applyHref.slice(0, 70)}...`);
            applyPage = await browser.newPage();
            await applyPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            await applyPage.setViewport({ width: 1280, height: 800 });
            await applyPage.goto(detailInfo.applyHref, { waitUntil: 'domcontentloaded', timeout: 45000 });
          } else {
            // Klik tombol di halaman utama
            await page.evaluate(() => {
              const applyEl = document.querySelector(
                '[data-testid="viewjob-indeed-apply"], [data-testid="primary-apply-action"] a, button#indeedApplyButton, [data-testid="indeedApplyButton"]'
              ) as HTMLElement;
              if (applyEl) applyEl.click();
            });
            await sleep(3000);

            // Cek apakah tab baru terbuka atau modal/iframe
            const allPages = await browser.pages();
            if (allPages.length > 2) {
              applyPage = allPages[allPages.length - 1];
            } else {
              applyPage = page;
            }
          }

          // Multi-step form solver Indeed Smart Apply
          let currentStep = 1;
          let reachedFinal = false;

          while (currentStep <= 10 && global.isBotRunning && !reachedFinal) {
            await sleep(2500);

            // Periksa frame jika modal menggunakan iframe
            let activeFrame = applyPage;
            const frames = applyPage.frames ? applyPage.frames() : [];
            const indeedFrame = frames.find((f: any) => f.name().includes('indeed-apply') || f.url().includes('indeed.com/apply') || f.url().includes('smartapply'));
            if (indeedFrame) {
              activeFrame = indeedFrame;
            }

            const formState = await activeFrame.evaluate(() => {
              const container = document.querySelector('#ia-container, .ia-BasePage, [data-testid="ia-container"], main, body') || document;
              const textContent = container.textContent || '';

              const isSuccess = /Application submitted|Lamaran terkirim|Terima kasih|Success/i.test(textContent);
              const titleEl = container.querySelector('h1, h2, h3, .ia-BasePage-heading, [data-testid="header-text"]');
              const stepTitle = titleEl ? (titleEl.textContent || '').trim().replace(/\s+/g, ' ') : `Step`;

              // Cek tombol Submit akhir
              const submitBtn = (
                container.querySelector('[data-testid="submit-button"], button[aria-label*="Submit"], button[aria-label*="Kirim lamaran"]') ||
                Array.from(container.querySelectorAll('button, input[type="submit"]')).find(b =>
                  /Submit your application|Kirim lamaran Anda|Submit application|Kirim lamaran/i.test(b.textContent || b.getAttribute('value') || '')
                )
              ) as HTMLElement | null;

              // Cek tombol Continue / Review / Next
              const continueBtn = (
                container.querySelector('[data-testid="continue-button"], [data-testid="review-button"], button[aria-label*="Continue"], button.ia-continueButton') ||
                Array.from(container.querySelectorAll('button, input[type="submit"]')).find(b =>
                  /Continue|Lanjutkan|Next|Selanjutnya|Review your application|Review application|Tinjau lamaran/i.test(b.textContent || b.getAttribute('value') || '')
                )
              ) as HTMLElement | null;

              // Ekstraksi pertanyaan input
              const questions: { id: string; question: string; type: string; options: string[]; inputSelector: string }[] = [];

              // 1. Radio groups
              const fieldsets = Array.from(container.querySelectorAll('fieldset, [role="radiogroup"]'));
              for (const fs of fieldsets) {
                const legend = fs.querySelector('legend, h3, h4, label, [data-testid*="label"]');
                const qText = (legend?.textContent || '').trim().replace(/\s+/g, ' ');
                const radios = Array.from(fs.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
                if (qText && radios.length > 0) {
                  const options = radios.map(r => {
                    const lbl = fs.querySelector(`label[for="${r.id}"]`) || r.closest('label');
                    return (lbl?.textContent || r.value || '').trim();
                  }).filter(Boolean);
                  questions.push({
                    id: radios[0].name || fs.id || '',
                    question: qText,
                    type: 'radiobutton',
                    options,
                    inputSelector: `input[name="${radios[0].name}"]`
                  });
                }
              }

              // 2. Select dropdowns
              const selects = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];
              for (const sel of selects) {
                const lbl = container.querySelector(`label[for="${sel.id}"]`) || sel.closest('label') || sel.parentElement;
                const qText = (lbl?.textContent || '').trim().replace(/\s+/g, ' ');
                if (qText) {
                  const options = Array.from(sel.options).map(o => o.text.trim()).filter(o => o && !/Select|Pilih/i.test(o));
                  questions.push({
                    id: sel.id || sel.name || '',
                    question: qText,
                    type: 'dropdown',
                    options,
                    inputSelector: sel.id ? `#${sel.id}` : `select[name="${sel.name}"]`
                  });
                }
              }

              // 3. Text & Number Inputs
              const inputs = Array.from(container.querySelectorAll('input[type="text"], input[type="number"], input[type="tel"], input[type="email"], textarea')) as HTMLInputElement[];
              for (const inp of inputs) {
                if (inp.id.includes('hidden') || inp.type === 'hidden') continue;
                const lbl = container.querySelector(`label[for="${inp.id}"]`) || inp.closest('label') || inp.parentElement;
                const qText = (lbl?.textContent || inp.placeholder || inp.name || '').trim().replace(/\s+/g, ' ');
                if (qText && !questions.some(q => q.id === (inp.id || inp.name))) {
                  questions.push({
                    id: inp.id || inp.name || '',
                    question: qText,
                    type: inp.type === 'number' ? 'number' : 'text',
                    options: [],
                    inputSelector: inp.id ? `#${inp.id}` : `input[name="${inp.name}"]`
                  });
                }
              }

              return {
                isSuccess,
                stepTitle,
                isSubmit: !!submitBtn,
                hasContinue: !!continueBtn,
                questions
              };
            });

            if (!formState || formState.isSuccess) {
              onLog('🏁 Form Indeed Apply selesai.');
              reachedFinal = true;
              break;
            }

            onLog(`📍 [Indeed] Step ${currentStep}: [${formState.stepTitle}] -> ${formState.questions.length} input terdeteksi.`);

            // Jawab pertanyaan di step ini
            for (const qItem of formState.questions) {
              const chosenAnswers = await answerQuestion(qItem.question, qItem.options, qItem.type as any);
              onLog(`🤖 [Indeed] Q: "${qItem.question}" -> Ans: [${chosenAnswers.join(' | ')}]`);
              appendQuestionToCsv(qItem.question, qItem.type as any, qItem.options, chosenAnswers);

              // Tulis ke DOM
              await activeFrame.evaluate((targetQ: any, answers: string[]) => {
                const container = document.querySelector('#ia-container, .ia-BasePage, [data-testid="ia-container"], main, body') || document;

                if (targetQ.type === 'radiobutton' && answers.length > 0) {
                  const radios = Array.from(container.querySelectorAll(targetQ.inputSelector)) as HTMLInputElement[];
                  for (const rd of radios) {
                    const lbl = container.querySelector(`label[for="${rd.id}"]`) || rd.closest('label');
                    const txt = (lbl?.textContent || rd.value || '').trim();
                    if (answers.some(a => txt.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(txt.toLowerCase()))) {
                      if (lbl) (lbl as HTMLElement).click();
                      else rd.click();
                      rd.checked = true;
                      rd.dispatchEvent(new Event('change', { bubbles: true }));
                      break;
                    }
                  }
                } else if (targetQ.type === 'dropdown' && answers.length > 0) {
                  const sel = container.querySelector(targetQ.inputSelector) as HTMLSelectElement;
                  if (sel) {
                    for (let idx = 0; idx < sel.options.length; idx++) {
                      if (answers.some(a => sel.options[idx].text.toLowerCase().includes(a.toLowerCase()))) {
                        sel.selectedIndex = idx;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                        break;
                      }
                    }
                  }
                } else if ((targetQ.type === 'text' || targetQ.type === 'number') && answers.length > 0) {
                  const inp = container.querySelector(targetQ.inputSelector) as HTMLInputElement;
                  if (inp) {
                    inp.focus();
                    let valToSet = answers[0] || '';
                    const isNumeric = /rate your|how many|berapa tahun|years of|experience/i.test(targetQ.question) && !/jelaskan|describe|project/i.test(targetQ.question);
                    if (isNumeric) {
                      const dMatch = valToSet.match(/\d+/);
                      valToSet = dMatch ? dMatch[0] : '8';
                    }
                    inp.value = valToSet;
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                    inp.blur();
                  }
                }
              }, qItem, chosenAnswers);

              await sleep(300);
            }

            // Jika step Submit Akhir
            if (formState.isSubmit) {
              if (config.debugTest) {
                onLog(`🏁 [DEBUG MODE] Form Indeed (${activeTitle}) selesai diisi.`);
                onLog(`   🛡️ Simulasi berhasil (Lamaran tidak dikirim ke Indeed).`);

                await addAppliedJob({
                  company: activeCompany,
                  title: activeTitle,
                  platform: 'Indeed',
                  jobUrl: targetJobUrl,
                  status: 'Dry-run Sim'
                });

                onLog(`📝 [Dry-run Sim] Data simulasi "${activeCompany}" (${activeTitle}) disimpan ke Google Sheets.`);
                successCount++;
                if (sharedLimiter) sharedLimiter.onJobSuccess();
                reachedFinal = true;
                break;
              } else {
                onLog(`🚀 Mengirim Lamaran resmi Indeed ke "${activeCompany}"...`);
                await activeFrame.evaluate(() => {
                  const submitBtn = (
                    document.querySelector('[data-testid="submit-button"], button[aria-label*="Submit"], button[aria-label*="Kirim lamaran"]') ||
                    Array.from(document.querySelectorAll('button, input[type="submit"]')).find(b =>
                      /Submit your application|Kirim lamaran Anda|Submit application|Kirim lamaran/i.test(b.textContent || b.getAttribute('value') || '')
                    )
                  ) as HTMLElement | null;
                  if (submitBtn) submitBtn.click();
                });
                await sleep(3500);

                await addAppliedJob({
                  company: activeCompany,
                  title: activeTitle,
                  platform: 'Indeed',
                  jobUrl: targetJobUrl,
                  status: 'Applied'
                });

                onLog(`🎉 Lamaran Indeed ke "${activeCompany}" (${activeTitle}) berhasil terkirim & disimpan ke Google Sheets!`);
                successCount++;
                if (sharedLimiter) sharedLimiter.onJobSuccess();
                reachedFinal = true;
                break;
              }
            }

            // Klik tombol Continue / Next
            if (formState.hasContinue) {
              onLog(`👉 [Indeed] Mengklik tombol "Lanjutkan / Continue"...`);
              await activeFrame.evaluate(() => {
                const continueBtn = (
                  document.querySelector('[data-testid="continue-button"], [data-testid="review-button"], button[aria-label*="Continue"], button.ia-continueButton') ||
                  Array.from(document.querySelectorAll('button, input[type="submit"]')).find(b =>
                    /Continue|Lanjutkan|Next|Selanjutnya|Review your application|Review application|Tinjau lamaran/i.test(b.textContent || b.getAttribute('value') || '')
                  )
                ) as HTMLElement | null;
                if (continueBtn) continueBtn.click();
              });
              await sleep(2500);
            } else {
              reachedFinal = true;
              break;
            }

            currentStep++;
          }
        } catch (itemErr: any) {
          onLog(`❌ Error saat memproses lamaran "${activeTitle}": ${itemErr.message || itemErr}`);
          errorCount++;
        } finally {
          if (applyPage && applyPage !== page && !applyPage.isClosed()) {
            await applyPage.close().catch(() => {});
          }
        }

        await sleep(1500);
      }

      // 5. Pagination ke Halaman Berikutnya di Indeed
      const hasNextPage = await page.evaluate(() => {
        const nextBtn = document.querySelector('a[data-testid="pagination-page-next"], nav[aria-label="pagination"] a[aria-label*="Next"], a[aria-label*="Berikutnya"]') as HTMLElement;
        if (nextBtn && !nextBtn.hasAttribute('disabled')) {
          nextBtn.click();
          return true;
        }
        return false;
      });

      if (hasNextPage) {
        currentPage++;
        onLog(`➡️ Berpindah ke Halaman Indeed ke-${currentPage}...`);
        await sleep(4000);
      } else {
        onLog('🏁 Mencapai halaman terakhir pencarian Indeed.');
        break;
      }
    }
  } catch (err: any) {
    onLog(`❌ Terjadi error pada bot Indeed: ${err.message || err}`);
    errorCount++;
  }

  return { successCount, alreadyAppliedCount, errorCount };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
