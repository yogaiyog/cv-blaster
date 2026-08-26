import { NextResponse } from 'next/server';
import path from 'path';

declare global {
  var activeSetupBrowser: any;
}

export async function POST(request: Request) {
  try {
    const { action } = await request.json();

    if (action === 'stop') {
      if (global.activeSetupBrowser) {
        try {
          await global.activeSetupBrowser.close();
        } catch (e) {}
        global.activeSetupBrowser = null;
        return NextResponse.json({ success: true, message: 'Browser closed' });
      }
      return NextResponse.json({ success: true, message: 'No browser running' });
    }

    if (global.activeSetupBrowser) {
      return NextResponse.json({ success: false, error: 'Browser is already running. Please close it first.' }, { status: 400 });
    }

    // Launch puppeteer in headful mode
    try {
      const puppeteer = require('puppeteer-extra');
      const StealthPlugin = require('puppeteer-extra-plugin-stealth');
      try {
        puppeteer.use(StealthPlugin());
      } catch (e) {}

      const profilePath = path.join(process.cwd(), 'automation-profile');
      const browser = await puppeteer.launch({
        headless: false,
        userDataDir: profilePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--window-size=1280,800'
        ],
        defaultViewport: null
      });

      global.activeSetupBrowser = browser;

      // Open Glints, Jobstreet, LinkedIn, and Indeed in separate tabs
      const pages = await browser.pages();
      const page1 = pages[0] || await browser.newPage();
      page1.goto('https://glints.com/id/login', { waitUntil: 'domcontentloaded' }).catch(() => {});

      const page2 = await browser.newPage();
      page2.goto('https://www.jobstreet.co.id/id/login', { waitUntil: 'domcontentloaded' }).catch(() => {});

      const page3 = await browser.newPage();
      page3.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' }).catch(() => {});

      const page4 = await browser.newPage();
      page4.goto('https://secure.indeed.com/auth', { waitUntil: 'domcontentloaded' }).catch(() => {});

      browser.on('disconnected', () => {
        global.activeSetupBrowser = null;
      });

      return NextResponse.json({ success: true, message: 'Browser launched successfully.' });
    } catch (error: any) {
      console.error('Error running setup browser:', error);
      global.activeSetupBrowser = null;
      return NextResponse.json({ success: false, error: error.message || 'Failed to launch browser' }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  const isRunning = !!global.activeSetupBrowser;
  return NextResponse.json({ isRunning });
}
