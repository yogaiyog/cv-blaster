import { NextRequest } from 'next/server';
import { startBot } from '@/lib/automation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') || 'headless';
  let configOverride = undefined;
  const configParam = request.nextUrl.searchParams.get('config');
  if (configParam) {
    try {
      configOverride = JSON.parse(configParam);
    } catch {}
  }

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

  // Launch bot asynchronously
  (async () => {
    try {
      await startBot(async (msg) => {
        await sendLog(msg);
      }, mode, configOverride);
    } catch (err: any) {
      await sendLog(`🚨 Fatal error: ${err.message || err}`);
    } finally {
      try {
        await writer.close();
      } catch (e) {}
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
  global.isBotRunning = false;
  return Response.json({ success: true, message: 'Bot stop signal triggered.' });
}
