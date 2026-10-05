import { NextRequest } from 'next/server';
import { launchBrowserWithFallback } from '@/lib/browserHelper';
import { syncJobstreetApplicationStatuses } from '@/lib/bots/jobstreet';
import { updateJobstreetApplicationStatuses } from '@/lib/storage';

export const dynamic = 'force-dynamic';

let activeJobstreetSyncBrowser: any = null;

export async function GET(request: NextRequest) {
  const mode = (request.nextUrl.searchParams.get('mode') || 'headless') as 'headless' | 'headful';

  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  const sendLog = async (message: string) => {
    try {
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ message, timestamp: new Date().toISOString() })}\n\n`)
      );
    } catch (err) {
      console.warn('SSE client disconnected:', err);
    }
  };

  (async () => {
    try {
      await sendLog('🚀 Memulai proses sinkronisasi status lamaran Jobstreet...');

      const { browser } = await launchBrowserWithFallback(mode, async (msg) => {
        await sendLog(msg);
      });
      activeJobstreetSyncBrowser = browser;

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      let totalSyncedUpdates = 0;
      const allDetails: Array<{ company: string; title: string; oldStatus: string; newStatus: string }> = [];

      const onBatchExtracted = async (batch: any[], pageNum: number) => {
        if (batch.length === 0) return;
        await sendLog(`💾 [Batch Halaman ${pageNum}] Menyimpan progres (${batch.length} kartu terpindai) ke penyimpanan lokal...`);
        const syncRes = await updateJobstreetApplicationStatuses(batch);
        totalSyncedUpdates += syncRes.updatedCount;
        if (syncRes.details.length > 0) {
          allDetails.push(...syncRes.details);
          for (const d of syncRes.details) {
            await sendLog(`   📌 ${d.company} - ${d.title}: "${d.oldStatus}" ➔ "${d.newStatus}"`);
          }
        }
        if (syncRes.updatedCount > 0) {
          await sendLog(`💾 [Batch Halaman ${pageNum}] ${syncRes.updatedCount} status berhasil diperbarui di penyimpanan lokal.`);
        }
      };

      // Ekstrak status kartu lamaran dari Jobstreet dengan batch saving
      const apps = await syncJobstreetApplicationStatuses(
        page,
        async (msg) => {
          await sendLog(msg);
        },
        100,
        onBatchExtracted
      );

      if (apps.length === 0) {
        await sendLog('ℹ️ Tidak ada data kartu lamaran yang ditemukan di akun Jobstreet Anda.');
      } else {
        await sendLog(`📊 Selesai memindai seluruh riwayat (${apps.length} kartu). Memeriksa sinkronisasi akhir...`);
        const result = await updateJobstreetApplicationStatuses(apps);
        totalSyncedUpdates += result.updatedCount;
        if (result.details.length > 0) {
          allDetails.push(...result.details);
          for (const d of result.details) {
            await sendLog(`   📌 ${d.company} - ${d.title}: "${d.oldStatus}" ➔ "${d.newStatus}"`);
          }
        }

        await sendLog(
          `✅ SINKRONISASI JOBSTREET SELESAI!\n` +
          `   - Total lamaran dibaca dari Jobstreet: ${result.totalScraped}\n` +
          `   - Total riwayat Jobstreet di local storage: ${result.totalInStorage}\n` +
          `   - Lamaran yang cocok: ${result.matchedCount}\n` +
          `   - Total status yang diperbarui: ${totalSyncedUpdates}`
        );

        if (totalSyncedUpdates === 0) {
          await sendLog('   ℹ️ Semua status lamaran di penyimpanan lokal sudah sesuai dengan status terbaru di Jobstreet.');
        }
      }
    } catch (err: any) {
      await sendLog(`🚨 Gagal memperbarui status Jobstreet: ${err.message || err}`);
    } finally {
      if (activeJobstreetSyncBrowser) {
        try {
          await activeJobstreetSyncBrowser.close();
        } catch {}
        activeJobstreetSyncBrowser = null;
      }
      try {
        await writer.close();
      } catch {}
    }
  })();

  return new Response(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export async function POST() {
  if (activeJobstreetSyncBrowser) {
    try {
      await activeJobstreetSyncBrowser.close();
    } catch {}
    activeJobstreetSyncBrowser = null;
  }
  return Response.json({ success: true, message: 'Jobstreet sync browser stopped' });
}
