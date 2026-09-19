import { NextRequest } from 'next/server';
import { launchBrowserWithFallback } from '@/lib/browserHelper';
import { syncGlintsApplicationStatuses } from '@/lib/bots/glints';
import { updateGlintsApplicationStatuses } from '@/lib/googleSheets';
import { getConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

let activeSyncBrowser: any = null;

export async function GET(request: NextRequest) {
  const mode = (request.nextUrl.searchParams.get('mode') || 'headless') as 'headless' | 'headful';
  let configOverride = undefined;
  const configParam = request.nextUrl.searchParams.get('config');
  if (configParam) {
    try {
      configOverride = JSON.parse(configParam);
    } catch {}
  }
  const config = getConfig(configOverride);

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
      await sendLog('🚀 Memulai proses sinkronisasi status lamaran Glints...');
      
      const { browser } = await launchBrowserWithFallback(mode, async (msg) => {
        await sendLog(msg);
      });
      activeSyncBrowser = browser;

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      let totalSyncedUpdates = 0;
      const allDetails: Array<{ company: string; title: string; oldStatus: string; newStatus: string; rowNumber: number }> = [];

      const onBatchExtracted = async (batch: any[], pageNum: number) => {
        if (batch.length === 0) return;
        await sendLog(`💾 [Batch Halaman ${pageNum}] Menyimpan progres (${batch.length} kartu terpindai) ke Google Sheets...`);
        const syncRes = await updateGlintsApplicationStatuses(batch, config);
        totalSyncedUpdates += syncRes.updatedCount;
        if (syncRes.details.length > 0) {
          allDetails.push(...syncRes.details);
          for (const d of syncRes.details) {
            await sendLog(`   📌 ${d.company} - ${d.title}: "${d.oldStatus}" ➔ "${d.newStatus}" (Baris ${d.rowNumber})`);
          }
        }
        if (syncRes.updatedCount > 0) {
          await sendLog(`💾 [Batch Halaman ${pageNum}] ${syncRes.updatedCount} status berhasil diperbarui di Google Sheets.`);
        }
      };

      // Ekstrak status kartu lamaran dari Glints dengan batch saving
      const apps = await syncGlintsApplicationStatuses(page, async (msg) => {
        await sendLog(msg);
      }, 200, onBatchExtracted);

      if (apps.length === 0) {
        await sendLog('ℹ️ Tidak ada data kartu lamaran yang ditemukan di akun Glints Anda.');
      } else {
        await sendLog(`📊 Selesai memindai seluruh riwayat (${apps.length} kartu). Memeriksa sinkronisasi akhir...`);
        const result = await updateGlintsApplicationStatuses(apps, config);
        totalSyncedUpdates += result.updatedCount;
        if (result.details.length > 0) {
          allDetails.push(...result.details);
          for (const d of result.details) {
            await sendLog(`   📌 ${d.company} - ${d.title}: "${d.oldStatus}" ➔ "${d.newStatus}" (Baris ${d.rowNumber})`);
          }
        }
        
        await sendLog(
          `✅ SINKRONISASI SELESAI!\n` +
          `   - Total lamaran dibaca dari Glints: ${result.totalScraped}\n` +
          `   - Total baris Glints di Google Sheets: ${result.totalGlintsInSheet}\n` +
          `   - Lamaran yang cocok: ${result.matchedCount}\n` +
          `   - Total status yang diperbarui: ${totalSyncedUpdates}`
        );

        if (totalSyncedUpdates === 0) {
          await sendLog('   ℹ️ Semua status lamaran di Google Sheets sudah sesuai dengan status terbaru di Glints.');
        }
      }
    } catch (err: any) {
      await sendLog(`🚨 Gagal memperbarui status: ${err.message || err}`);
    } finally {
      if (activeSyncBrowser) {
        try {
          await activeSyncBrowser.close();
        } catch {}
        activeSyncBrowser = null;
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
      'Connection': 'keep-alive',
    },
  });
}

export async function POST() {
  if (activeSyncBrowser) {
    try {
      await activeSyncBrowser.close();
    } catch {}
    activeSyncBrowser = null;
  }
  return Response.json({ success: true, message: 'Sync browser stopped' });
}
