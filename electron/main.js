const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');

let mainWindow = null;
let server = null;

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

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
  const next = require('next');
  const appPath = isDev ? process.cwd() : path.join(process.resourcesPath, 'app');

  const nextApp = next({
    dev: isDev,
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
    backgroundColor: '#0f172a', // Slate-900 background
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  // Open external links in default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

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
