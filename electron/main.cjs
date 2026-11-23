const { app, BrowserWindow, session } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

let mainWindow = null;
let serverProcess = null;

const SERVER_URL = process.env.LINU_SERVER_URL || 'http://localhost:3000';

function checkServerReady() {
  return new Promise((resolve) => {
    const req = http.get(`${SERVER_URL}/api/linu/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureBackendRunning() {
  if (await checkServerReady()) {
    return;
  }

  const appRoot = app.getAppPath();
  const bundledServer = path.join(appRoot, 'dist-server', 'server.mjs');
  const fs = require('fs');

  if (fs.existsSync(bundledServer)) {
    serverProcess = spawn(process.execPath, [bundledServer], {
      cwd: appRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
      },
      stdio: 'ignore',
    });
  } else {
    const tsxBin = path.join(appRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
    const serverTs = path.join(appRoot, 'server.ts');
    serverProcess = spawn(tsxBin, [serverTs], {
      cwd: appRoot,
      env: { ...process.env },
      shell: process.platform === 'win32',
      stdio: 'ignore',
    });
  }

  for (let i = 0; i < 30; i++) {
    if (await checkServerReady()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
}

function createLinuWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 360,
    minWidth: 280,
    minHeight: 220,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Grant microphone & camera permissions cleanly when user interacts
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'audioCapture' || permission === 'videoCapture') {
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow.loadURL(SERVER_URL);
}

app.whenReady().then(async () => {
  await ensureBackendRunning();
  createLinuWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLinuWindow();
    }
  });
});

app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
