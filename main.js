const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const dotenv = require('dotenv');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let serverProcess = null;
let isUpdaterInitialized = false;
let isServerReadyState = false;
const PORT = 3000;
const APP_URL = `http://localhost:${PORT}/login`;
const HEALTHCHECK_URL = APP_URL;
const CSC_WARMUP_URL = `http://127.0.0.1:${PORT}/api/status/warmup`;
const MAX_RETRIES = 120;
const RETRY_DELAY = 500;
let updaterState = {
  status: 'idle',
  version: app.getVersion(),
  progress: null,
  message: '',
  error: null,
};
const SERVER_ONLY_MODE = process.argv.includes('--server-only');

function getDebugLogPath() {
  const localAppData = process.env.LOCALAPPDATA || process.cwd();
  const logDir = path.join(localAppData, 'KalingaOpsHub');

  fs.mkdirSync(logDir, { recursive: true });
  return path.join(logDir, 'electron-main.log');
}

function logDebug(message, extra = null) {
  const timestamp = new Date().toISOString();
  const suffix =
    extra == null
      ? ''
      : ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`;
  const line = `[${timestamp}] ${message}${suffix}`;

  try {
    console.log(line);
  } catch {}

  try {
    fs.appendFileSync(getDebugLogPath(), `${line}\n`);
  } catch (error) {
    console.error('Failed to write debug log:', error.message);
  }
}

function broadcastUpdaterState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', updaterState);
  }
}

function setUpdaterState(nextState) {
  updaterState = {
    ...updaterState,
    ...nextState,
  };

  logDebug('Updater state', updaterState);
  broadcastUpdaterState();
}

function promptToInstallUpdate(version) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  dialog
    .showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: 'Update Ready',
      message: 'A new update has been downloaded.',
      detail: `Version ${version} is ready to install. Restart now to finish updating.`,
    })
    .then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    })
    .catch((error) => {
      logDebug('Failed to show install update prompt', error.message);
    });
}

function initializeAutoUpdater() {
  if (isUpdaterInitialized || !app.isPackaged) {
    return;
  }

  isUpdaterInitialized = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setUpdaterState({
      status: 'checking',
      progress: null,
      message: 'Checking for updates...',
      error: null,
    });
  });

  autoUpdater.on('update-available', (info) => {
    setUpdaterState({
      status: 'downloading',
      version: info.version,
      progress: 0,
      message: `Downloading version ${info.version}...`,
      error: null,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    setUpdaterState({
      status: 'downloading',
      progress: Math.round(progress.percent),
      message: `Downloading update... ${Math.round(progress.percent)}%`,
      error: null,
    });
  });

  autoUpdater.on('update-not-available', () => {
    setUpdaterState({
      status: 'up-to-date',
      version: app.getVersion(),
      progress: null,
      message: `You are using the latest installed version: v${app.getVersion()}.`,
      error: null,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setUpdaterState({
      status: 'downloaded',
      version: info.version,
      progress: 100,
      message: `Version ${info.version} is ready to install.`,
      error: null,
    });

    promptToInstallUpdate(info.version);
  });

  autoUpdater.on('error', (error) => {
    setUpdaterState({
      status: 'error',
      progress: null,
      message: error?.message || 'Unable to check for updates right now.',
      error: error?.message || String(error),
    });
  });
}

function getRuntimeAppRoot() {
  if (!app.isPackaged) {
    return app.getAppPath();
  }

  return process.resourcesPath;
}

function getSystemLogoPath() {
  const appRoot = getRuntimeAppRoot();

  if (process.platform === 'win32') {
    return path.join(appRoot, 'public', 'icons', 'Logo.ico');
  }

  return path.join(appRoot, 'public', 'icons', 'Logo-256.png');
}

function getGoogleLogoPath() {
  return path.join(getRuntimeAppRoot(), 'public', 'icons', 'google.ico');
}

function getLoadingScreenUrl() {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0"
    />
    <title>Kalinga OpsHub</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", Arial, sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(190, 222, 255, 0.95), transparent 48%),
          linear-gradient(160deg, #f4f8fc 0%, #dfe9f5 100%);
        color: #16324f;
      }

      main {
        width: min(420px, calc(100vw - 48px));
        padding: 32px 28px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.88);
        box-shadow: 0 22px 60px rgba(22, 50, 79, 0.18);
        text-align: center;
      }

      .spinner {
        width: 52px;
        height: 52px;
        margin: 0 auto 20px;
        border-radius: 50%;
        border: 5px solid rgba(26, 74, 122, 0.12);
        border-top-color: #1a4a7a;
        animation: spin 0.9s linear infinite;
      }

      h1 {
        margin: 0 0 10px;
        font-size: 1.7rem;
        line-height: 1.15;
      }

      p {
        margin: 0;
        line-height: 1.5;
        color: rgba(22, 50, 79, 0.8);
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="spinner" aria-hidden="true"></div>
      <h1>Opening Kalinga OpsHub</h1>
      <p>The desktop shell is ready. The local app server is finishing startup.</p>
    </main>
  </body>
</html>`;

  return `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
}

function loadAppIntoWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const currentUrl = mainWindow.webContents.getURL();
  if (currentUrl === APP_URL) {
    return;
  }

  logDebug('Loading URL', APP_URL);
  mainWindow.loadURL(APP_URL).catch((error) => {
    logDebug('Failed to load app URL', error.message);
  });
}

function isServerReady() {
  return new Promise((resolve) => {
    const req = http.get(HEALTHCHECK_URL, (res) => {
      req.destroy();
      resolve(res.statusCode === 200 || res.statusCode === 307);
    });

    req.on('error', (err) => {
      logDebug('Server not ready', err.message);
      resolve(false);
    });

    req.setTimeout(2000, () => {
      req.destroy();
      logDebug('Server health check timed out');
      resolve(false);
    });
  });
}

function loadRuntimeEnv(appPath) {
  const files = ['.env', '.env.local'];
  const env = {};

  for (const fileName of files) {
    const fullPath = path.join(appPath, fileName);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    try {
      const parsed = dotenv.parse(fs.readFileSync(fullPath));
      Object.assign(env, parsed);
    } catch (error) {
      logDebug(`Failed parsing ${fileName}`, error.message);
    }
  }

  return env;
}

function startEmbeddedServer(options = {}) {
  const { detached = false, pipeLogs = true } = options;

  if (!app.isPackaged) {
    return;
  }

  const appPath = getRuntimeAppRoot();
  const standaloneRoot = path.join(appPath, '.next', 'standalone');
  const standaloneNextDir = path.join(standaloneRoot, '.next');
  const sourceStaticDir = path.join(appPath, '.next', 'static');
  const targetStaticDir = path.join(standaloneNextDir, 'static');
  const sourcePublicDir = path.join(appPath, 'public');
  const targetPublicDir = path.join(standaloneRoot, 'public');
  const runtimeEnv = loadRuntimeEnv(appPath);

  logDebug('App path', app.getAppPath());
  logDebug('Runtime app root', appPath);

  try {
    if (fs.existsSync(sourceStaticDir) && !fs.existsSync(targetStaticDir)) {
      fs.mkdirSync(path.dirname(targetStaticDir), { recursive: true });
      fs.cpSync(sourceStaticDir, targetStaticDir, { recursive: true });
      logDebug('Copied static assets into standalone runtime');
    }

    if (fs.existsSync(sourcePublicDir) && !fs.existsSync(targetPublicDir)) {
      fs.cpSync(sourcePublicDir, targetPublicDir, { recursive: true });
      logDebug('Copied public assets into standalone runtime');
    }
  } catch (assetError) {
    logDebug('Failed preparing standalone assets', assetError.message);
  }

  logDebug(
    'Firebase runtime env present',
    String(
      Boolean(
        runtimeEnv.FIREBASE_PROJECT_ID &&
          runtimeEnv.FIREBASE_CLIENT_EMAIL &&
          runtimeEnv.FIREBASE_PRIVATE_KEY
      )
    )
  );

  const serverScript = path.join(standaloneRoot, 'server.js');
  logDebug('Server script path', serverScript);

  if (!fs.existsSync(serverScript)) {
    logDebug('Embedded server script not found', serverScript);
    dialog.showErrorBox(
      'Kalinga OpsHub Startup Error',
      'Required server files were not found in the installed app. Please reinstall or rebuild the installer.'
    );
    return;
  }

  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: standaloneRoot,
    env: {
      ...process.env,
      ...runtimeEnv,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
    },
    stdio: detached ? 'ignore' : ['pipe', 'pipe', 'pipe'],
    detached,
    windowsHide: true,
  });

  if (detached) {
    serverProcess.unref();
    logDebug('Detached background server process started', String(serverProcess.pid));
    return;
  }

  if (pipeLogs && serverProcess.stdout) {
    serverProcess.stdout.on('data', (data) => {
      logDebug('[Server]', data.toString().trim());
    });
  }

  if (pipeLogs && serverProcess.stderr) {
    serverProcess.stderr.on('data', (data) => {
      logDebug('[Server Error]', data.toString().trim());
    });
  }

  serverProcess.on('error', (error) => {
    logDebug('Embedded server failed to start', error.message);
  });

  serverProcess.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      logDebug('Embedded server exited with code', String(code));
    }

    if (signal) {
      logDebug('Embedded server terminated by signal', String(signal));
    }
  });
}

function configureServerAutoStart() {
  if (!app.isPackaged || process.platform !== 'win32') {
    return;
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      args: ['--server-only'],
      path: process.execPath,
    });
    logDebug('Configured login autostart for server-only mode');
  } catch (error) {
    logDebug('Failed configuring login autostart', error.message);
  }
}

async function waitForServer(retries = 0) {
  if (retries > MAX_RETRIES) {
    logDebug('Failed to connect to server after maximum retries');
    return false;
  }

  logDebug('Server check attempt', `${retries + 1}/${MAX_RETRIES}`);
  const ready = await isServerReady();
  if (ready) {
    logDebug('Server is ready');
    return true;
  }

  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
  return waitForServer(retries + 1);
}

function requestServerWarmup() {
  return new Promise((resolve) => {
    const req = http.get(CSC_WARMUP_URL, (res) => {
      const chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');

        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          logDebug('Server warmup completed', bodyText || '{}');
        } else {
          logDebug('Server warmup failed', `${res.statusCode || 0} ${bodyText}`);
        }

        resolve();
      });
    });

    req.on('error', (error) => {
      logDebug('Server warmup request error', error.message);
      resolve();
    });

    req.setTimeout(5000, () => {
      req.destroy();
      logDebug('Server warmup timed out');
      resolve();
    });
  });
}

function createWindow() {
  try {
    logDebug('Creating Electron window');
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      minWidth: 800,
      minHeight: 600,
      maximizable: true,
      autoHideMenuBar: true,
      icon: getSystemLogoPath(),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
      },
      show: false,
    });

    mainWindow.loadURL(getLoadingScreenUrl()).catch((error) => {
      logDebug('Failed to load startup screen', error.message);
    });

    if (isServerReadyState) {
      loadAppIntoWindow();
    }

    mainWindow.webContents.on('did-finish-load', () => {
      broadcastUpdaterState();
    });

    mainWindow.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 520,
        height: 700,
        minWidth: 460,
        minHeight: 620,
        autoHideMenuBar: true,
        title: 'Google Sign-In',
        icon: getGoogleLogoPath(),
      },
    }));

    mainWindow.once('ready-to-show', () => {
      mainWindow.maximize();
      logDebug('Window ready to show');
      mainWindow.show();
    });

    setTimeout(() => {
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.maximize();
        mainWindow.show();
      }
    }, 2500);

    mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
      logDebug('Window failed to load', `${code}: ${description}`);
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show();
      }
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
      const key = String(input.key || '').toLowerCase();
      const ctrlOrCmd = input.control || input.meta;
      const blocked =
        key === 'f12' ||
        (ctrlOrCmd &&
          input.shift &&
          (key === 'i' || key === 'j' || key === 'c'));

      if (blocked) {
        event.preventDefault();
      }
    });

    mainWindow.on('closed', () => {
      logDebug('Window closed');
      mainWindow = null;
    });

    mainWindow.webContents.on('crashed', () => {
      logDebug('Window crashed');
    });

    logDebug('Electron window created successfully');
  } catch (err) {
    logDebug(
      'Failed to create window',
      err?.stack || err?.message || String(err)
    );
  }
}

app.on('ready', async () => {
  logDebug('Electron app ready event fired');
  configureServerAutoStart();

  if (SERVER_ONLY_MODE) {
    const serverAlreadyRunning = await isServerReady();
    if (serverAlreadyRunning) {
      logDebug('Server-only mode detected running backend, exiting.');
      app.quit();
      return;
    }

    startEmbeddedServer({ detached: true, pipeLogs: false });
    app.quit();
    return;
  }

  Menu.setApplicationMenu(null);
  createWindow();
  initializeAutoUpdater();
  const serverAlreadyRunning = await isServerReady();
  if (serverAlreadyRunning) {
    logDebug('Detected existing local server. Reusing running instance.');
  } else {
    startEmbeddedServer();
  }
  logDebug('Waiting for server to start');

  const ready = await waitForServer();

  if (ready) {
    isServerReadyState = true;
    logDebug('Server started successfully. Loading app into window.');
    await requestServerWarmup();
    loadAppIntoWindow();
  } else {
    logDebug('Server failed to start within timeout period.');
    app.quit();
  }
});

app.on('window-all-closed', () => {
  logDebug('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess && !app.isPackaged) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on('activate', () => {
  logDebug('App activated');
  if (mainWindow === null) {
    createWindow();
  }
});

process.on('uncaughtException', (err) => {
  logDebug('Uncaught exception', err?.stack || err?.message || String(err));
});

ipcMain.handle('updater:get-state', async () => updaterState);

ipcMain.handle('updater:check-for-updates', async () => {
  if (!app.isPackaged) {
    return {
      ok: false,
      error: 'Auto-update works only in the installed desktop app.',
    };
  }

  if (
    updaterState.status === 'checking' ||
    updaterState.status === 'downloading'
  ) {
    return { ok: true, busy: true };
  }

  try {
    initializeAutoUpdater();
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    setUpdaterState({
      status: 'error',
      progress: null,
      message: error?.message || 'Unable to check for updates right now.',
      error: error?.message || String(error),
    });

    return {
      ok: false,
      error: error?.message || 'Unable to check for updates right now.',
    };
  }
});

ipcMain.handle('updater:install-update', async () => {
  if (updaterState.status !== 'downloaded') {
    return {
      ok: false,
      error: 'No downloaded update is ready to install yet.',
    };
  }

  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true);
  });

  return { ok: true };
});

ipcMain.handle('pdf:open-with-system', async (_event, pdfBytes, fileName) => {
  try {
    const saveDir = 'C:\\OpsHUB\\Filled Leave';

    logDebug('Creating PDF save directory', saveDir);

    // Create directory if it doesn't exist
    fs.mkdirSync(saveDir, { recursive: true });

    const pdfPath = path.join(saveDir, fileName || 'document.pdf');

    logDebug('Saving PDF to', pdfPath);

    // Write PDF bytes to file
    const buffer = Buffer.from(pdfBytes);
    await new Promise((resolve, reject) => {
      fs.writeFile(pdfPath, buffer, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    logDebug('Opening PDF with system viewer', pdfPath);

    // Open with system default application
    await shell.openPath(pdfPath);

    return { ok: true, savedPath: pdfPath };
  } catch (error) {
    logDebug('Failed to save and open PDF', error.message);
    return {
      ok: false,
      error: error?.message || 'Failed to save and open PDF',
    };
  }
});
