const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');
const fs = require('fs');

let mainWindow = null;
let server = null;

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

// Ensure user data directory is created and accessible
const userDataPath = app.getPath('userData');
process.env.APP_USER_DATA = userDataPath;
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

// Helper to find an available port
function getFreePort(startPort = 3000) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(startPort, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', () => {
      // Port in use, try next
      resolve(getFreePort(startPort + 1));
    });
  });
}

async function startNextServer() {
  const port = await getFreePort(3000);
  const appPath = isDev ? process.cwd() : path.join(process.resourcesPath, 'app');

  // Change working directory to appPath so Next.js finds its build manifests
  process.chdir(appPath);
  process.env.NODE_ENV = isDev ? 'development' : 'production';
  process.env.PORT = String(port);

  const next = require('next');
  const nextApp = next({
    dev: false, // In packaged app, always production
    dir: appPath,
    hostname: '127.0.0.1',
    port: port,
  });

  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  server = http.createServer((req, res) => {
    handle(req, res);
  });

  await new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', (err) => {
      if (err) return reject(err);
      console.log(`[Electron] Next.js Server running on http://127.0.0.1:${port}`);
      resolve();
    });
  });

  return port;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    title: 'CV Blaster - Auto Apply Bot',
    icon: path.join(__dirname, 'assets/icon.png'),
    backgroundColor: '#0f172a', // Slate-900 background
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  // Open DevTools with F12 or Cmd+Option+I (macOS) / Ctrl+Shift+I (Windows)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      input.key === 'F12' ||
      (input.meta && input.alt && input.key.toLowerCase() === 'i') ||
      (input.control && input.shift && input.key.toLowerCase() === 'i')
    ) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // 1. Immediately load the sleek splash loading screen
  const splashPath = path.join(__dirname, 'splash.html');
  if (fs.existsSync(splashPath)) {
    try {
      await mainWindow.loadFile(splashPath);
    } catch {}
  }

  let loadUrl = 'http://localhost:3000';

  if (isDev) {
    // In Dev mode with concurrently, Next dev server is already running
    const devPort = process.env.PORT || 3000;
    loadUrl = `http://localhost:${devPort}`;
  } else {
    // In Production packaged app, boot local server
    try {
      const port = await startNextServer();
      loadUrl = `http://127.0.0.1:${port}`;
    } catch (err) {
      console.error('[Electron] Failed to start Next server:', err);
      const errHtml = `<html><body style="background:#0f172a;color:#f87171;font-family:sans-serif;padding:30px;"><h2>Gagal Memulai CV Blaster</h2><pre style="background:#1e293b;padding:16px;border-radius:8px;color:#e2e8f0;white-space:pre-wrap;">${err.stack || err.message}</pre></body></html>`;
      await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errHtml)}`);
      mainWindow.webContents.openDevTools();
      return;
    }
  }

  // Load the web UI
  await mainWindow.loadURL(loadUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (server) {
    try {
      server.close();
    } catch {}
  }
});
