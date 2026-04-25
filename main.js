const {
  app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, dialog, shell
} = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const dgram = require('dgram');
const http = require('http');
const fs = require('fs');
const { startAutoInstaller, stopAutoInstaller, installInDirectory } = require('./hook-installer');
const { initAnalytics, stopAnalytics, track } = require('./analytics');

// ── Settings persistence ────────────────────────────────────────────
let SETTINGS_PATH = '';

const defaults = {
  paused: false,
  volume: 0.85,
  watchFolder: path.join(require('os').homedir(), 'Dev'),
  enterTrigger: true,
};

let settings = { ...defaults };

function initSettings() {
  SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
  loadSettings();
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      Object.assign(settings, JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')));
    }
  } catch (_) {}
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (_) {}
}

loadSettings();

// ── State ───────────────────────────────────────────────────────────
let overlay = null;
let overlayReady = false;
let cooldown = false;
let tray = null;
let keyMonitor = null;
let onboardingWin = null;
let insightsWin = null;
const COOLDOWN_MS = 400;

// ── Overlay ─────────────────────────────────────────────────────────
function createOverlay() {
  const { bounds } = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    type: 'panel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });

  overlay.setAlwaysOnTop(true, 'screen-saver', 1);
  overlay.setIgnoreMouseEvents(true);
  overlayReady = false;

  overlay.loadFile('overlay.html');
  overlay.webContents.on('did-finish-load', () => {
    overlay.showInactive();
    overlay.webContents.send('warmup');
    console.log('⏳ Overlay loaded, warming up...');
  });

  overlay.on('closed', () => {
    overlay = null;
    overlayReady = false;
  });
}

// ── Trigger logic ───────────────────────────────────────────────────
function triggerWhip() {
  if (settings.paused) return;
  if (cooldown || !overlayReady) return;
  cooldown = true;
  setTimeout(() => { cooldown = false; }, COOLDOWN_MS);
  // Send volume to overlay
  overlay.webContents.send('set-volume', settings.volume);
  overlay.webContents.send('trigger-whip');
}

let enterTimer = null;

function triggerFromEnter() {
  if (!settings.enterTrigger) return;
  if (enterTimer) return;
  enterTimer = setTimeout(() => {
    enterTimer = null;
    triggerWhip();
    track('enter');
  }, 150);
}

function triggerFromHook(hookType) {
  if (enterTimer) {
    clearTimeout(enterTimer);
    enterTimer = null;
  }
  triggerWhip();
  track(hookType || 'kiro_hook');
}

// ── IPC ─────────────────────────────────────────────────────────────
ipcMain.on('whip-done', () => {});
ipcMain.on('warmup-done', () => {
  overlayReady = true;
  console.log('✅ Warmup complete — ready for whips!');
});
ipcMain.handle('get-tray-bounds', () => {
  if (tray) {
    const bounds = tray.getBounds();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }
  return null;
});

// ── Tray Menu ───────────────────────────────────────────────────────
function buildTrayMenu() {
  const pauseLabel = settings.paused ? '▶️  Resume' : '⏸  Pause';
  const volLabel = `🔊 Volume: ${Math.round(settings.volume * 100)}%`;

  return Menu.buildFromTemplate([
    { label: '🍑 Whip Me Bad', enabled: false },
    { type: 'separator' },
    {
      label: '📊 Insights',
      click: () => showInsights(),
    },
    {
      label: pauseLabel,
      click: () => {
        settings.paused = !settings.paused;
        saveSettings();
        updateTray();
        console.log(settings.paused ? '⏸ Paused' : '▶️ Resumed');
      },
    },
    { type: 'separator' },
    {
      label: `${volLabel}`,
      enabled: false,
    },
    {
      label: '   🔈 25%',
      type: 'radio',
      checked: settings.volume === 0.25,
      click: () => { settings.volume = 0.25; saveSettings(); updateTray(); },
    },
    {
      label: '   🔉 50%',
      type: 'radio',
      checked: settings.volume === 0.5,
      click: () => { settings.volume = 0.5; saveSettings(); updateTray(); },
    },
    {
      label: '   🔊 75%',
      type: 'radio',
      checked: settings.volume === 0.75,
      click: () => { settings.volume = 0.75; saveSettings(); updateTray(); },
    },
    {
      label: '   🔊 100%',
      type: 'radio',
      checked: settings.volume >= 0.85,
      click: () => { settings.volume = 0.85; saveSettings(); updateTray(); },
    },
    { type: 'separator' },
    {
      label: settings.enterTrigger ? '⌨️  Enter Key: On' : '⌨️  Enter Key: Off',
      click: () => {
        settings.enterTrigger = !settings.enterTrigger;
        saveSettings();
        updateTray();
      },
    },
    { type: 'separator' },
    {
      label: '📁 Install Hooks in Project...',
      click: async () => {
        const result = await dialog.showOpenDialog({
          title: 'Select a Kiro project folder',
          properties: ['openDirectory'],
          message: 'Pick a project folder to install Whip Me Bad hooks',
        });
        if (!result.canceled && result.filePaths.length > 0) {
          const dir = result.filePaths[0];
          try {
            await installInDirectory(dir);
            dialog.showMessageBox({
              type: 'info',
              title: 'Whip Me Bad',
              message: '🍑 Hooks installed!',
              detail: `Installed Kiro hooks in:\n${dir}`,
            });
          } catch (err) {
            dialog.showMessageBox({
              type: 'error',
              title: 'Whip Me Bad',
              message: 'Failed to install hooks',
              detail: err.message,
            });
          }
        }
      },
    },
    {
      label: `📂 Watch: ${settings.watchFolder || 'Not set'}`,
      click: async () => {
        const result = await dialog.showOpenDialog({
          title: 'Select your dev folder to watch',
          properties: ['openDirectory'],
          defaultPath: settings.watchFolder,
          message: 'New Kiro projects in this folder will get hooks automatically',
        });
        if (!result.canceled && result.filePaths.length > 0) {
          settings.watchFolder = result.filePaths[0];
          saveSettings();
          updateTray();
          // Restart watcher
          startFSWatcher();
        }
      },
    },
    { type: 'separator' },
    {
      label: app.getLoginItemSettings().openAtLogin ? '✅ Launch at Login' : '⬜ Launch at Login',
      click: () => {
        const current = app.getLoginItemSettings().openAtLogin;
        app.setLoginItemSettings({ openAtLogin: !current });
        updateTray();
      },
    },
    {
      label: '🚪 Quit',
      click: () => {
        stopAutoInstaller();
        stopAnalytics();
        if (keyMonitor) keyMonitor.kill();
        app.quit();
      },
    },
  ]);
}

function updateTray() {
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
    tray.setToolTip(settings.paused ? 'Whip Me Bad (Paused)' : 'Whip Me Bad 🍑');
  }
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(false);
    tray = new Tray(icon);
    tray.setToolTip('Whip Me Bad 🍑');
    tray.setContextMenu(buildTrayMenu());
    console.log('🍑 Tray icon created');
  } catch (err) {
    console.error('❌ Tray creation failed:', err.message);
  }
}

// ── FSEvents Watcher — watches for new .kiro/ folders ───────────────
let fsWatcher = null;

function startFSWatcher() {
  if (fsWatcher) { fsWatcher.close(); fsWatcher = null; }
  if (!settings.watchFolder || !fs.existsSync(settings.watchFolder)) return;

  try {
    fsWatcher = fs.watch(settings.watchFolder, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      // Trigger on .kiro directory creation
      if (filename.endsWith('.kiro') || filename.includes('.kiro/')) {
        const parts = filename.split(path.sep);
        const kiroIdx = parts.indexOf('.kiro');
        if (kiroIdx > 0) {
          const projectDir = path.join(settings.watchFolder, ...parts.slice(0, kiroIdx));
          installInDirectory(projectDir).catch(() => {});
        }
      }
    });
    console.log(`👁️  Watching ${settings.watchFolder} for new Kiro projects`);
  } catch (err) {
    console.warn('FSWatcher error:', err.message);
  }
}

// ── Key Monitor ─────────────────────────────────────────────────────
function startKeyMonitor() {
  if (process.platform !== 'darwin') return;

  const swiftCode = `
import Cocoa

let eventMask = (1 << CGEventType.keyDown.rawValue)

guard let tap = CGEvent.tapCreate(
  tap: .cgSessionEventTap,
  place: .tailAppendEventTap,
  options: .listenOnly,
  eventsOfInterest: CGEventMask(eventMask),
  callback: { (proxy, type, event, refcon) -> Unmanaged<CGEvent>? in
    if type == .keyDown {
      let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
      if keyCode == 36 || keyCode == 76 {
        print("ENTER", terminator: "\\n")
        fflush(stdout)
      }
    }
    return Unmanaged.passRetained(event)
  },
  userInfo: nil
) else {
  fputs("ERROR: Failed to create event tap. Grant Accessibility permissions.\\n", stderr)
  exit(1)
}

let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)

fputs("READY\\n", stderr)
CFRunLoopRun()
`;

  keyMonitor = spawn('swift', ['-e', swiftCode], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  keyMonitor.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line === 'ENTER') triggerFromEnter();
    }
  });

  keyMonitor.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg === 'READY') {
      console.log('🔥 Enter key monitor active');
    } else if (msg.includes('Failed to create event tap')) {
      console.error('⚠️  Accessibility permission required!');
      console.error('   System Settings → Privacy & Security → Accessibility');
    }
  });

  keyMonitor.on('close', (code) => {
    if (code !== 0) console.error(`Key monitor exited with code ${code}`);
  });

  app.on('before-quit', () => { keyMonitor.kill(); });
}

// ── Onboarding ──────────────────────────────────────────────────────

function showInsights() {
  if (insightsWin) { insightsWin.focus(); return; }
  const { getStats } = require('./analytics');
  const stats = getStats();

  insightsWin = new BrowserWindow({
    width: 380,
    height: 560,
    center: true,
    frame: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0c0a10',
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  insightsWin.loadFile('insights.html', {
    query: { device: stats.deviceId },
  });
  insightsWin.once('ready-to-show', () => insightsWin.show());
  insightsWin.on('closed', () => { insightsWin = null; });
}

// ── Onboarding ──────────────────────────────────────────────────────
function isFirstLaunch() {
  return !fs.existsSync(SETTINGS_PATH);
}

function showOnboarding() {
  const { bounds } = screen.getPrimaryDisplay();
  onboardingWin = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    type: 'panel',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });

  onboardingWin.setAlwaysOnTop(true, 'screen-saver');
  onboardingWin.loadFile('onboarding.html');
  onboardingWin.once('ready-to-show', () => {
    onboardingWin.show();
  });
  onboardingWin.on('closed', () => { onboardingWin = null; });
}

ipcMain.on('pick-folder', async () => {
  if (!onboardingWin) return;
  const result = await dialog.showOpenDialog(onboardingWin, {
    title: 'Select your dev folder',
    properties: ['openDirectory'],
    message: 'Pick the folder where you keep your projects',
  });
  if (!result.canceled && result.filePaths.length > 0) {
    settings.watchFolder = result.filePaths[0];
    saveSettings();
    onboardingWin.webContents.send('folder-picked', result.filePaths[0]);
  } else {
    onboardingWin.webContents.send('folder-picked', null);
  }
});

ipcMain.on('onboarding-done', () => {
  saveSettings();
  if (onboardingWin) {
    onboardingWin.close();
    onboardingWin = null;
  }
  // Hide dock again — back to menu bar only
  if (process.platform === 'darwin') app.dock.hide();
  startPostOnboarding();
});

function startPostOnboarding() {
  createOverlay();
  startKeyMonitor();
  startTriggerListeners();
  startAutoInstaller();
  startFSWatcher();
  console.log('🍑 Whip Me Bad is running!');
}

// ── Kill stale ports ────────────────────────────────────────────────
function killStalePorts() {
  for (const port of [31337, 31338]) {
    try {
      const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
      if (pids) {
        const myPid = String(process.pid);
        const otherPids = pids.split('\n').filter(p => p !== myPid);
        if (otherPids.length) {
          execSync(`kill -9 ${otherPids.join(' ')}`);
          console.log(`🧹 Killed stale process(es) on port ${port}`);
        }
      }
    } catch (_) {}
  }
}

// ── HTTP + UDP listeners ────────────────────────────────────────────
function startTriggerListeners() {
  const httpServer = http.createServer((req, res) => {
    if (req.url.startsWith('/whip')) {
      // Parse trigger type from query: /whip?type=kiro_prompt
      const url = new URL(req.url, 'http://localhost');
      const hookType = url.searchParams.get('type') || 'kiro_hook';
      triggerFromHook(hookType);
      res.writeHead(200);
      res.end('OK');
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn('⚠️  HTTP port 31338 in use, retrying in 2s...');
      setTimeout(() => httpServer.listen(31338, '127.0.0.1'), 2000);
    }
  });
  httpServer.listen(31338, '127.0.0.1', () => {
    console.log('📡 HTTP trigger on http://127.0.0.1:31338/whip');
  });

  const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  udp.on('message', (msg) => {
    if (msg.toString().trim() === 'WHIP') triggerFromHook();
  });
  udp.on('error', (err) => console.warn('UDP error:', err.message));
  udp.bind(31337, '127.0.0.1', () => {
    console.log('📡 UDP trigger on port 31337');
  });
}

// ── Single instance lock — prevent multiple copies ──────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.log('Another instance is running. Quitting.');
  app.quit();
}

app.on('second-instance', () => {
  // If someone tries to open a second instance, just show the tray
  if (tray) tray.popUpContextMenu();
});

// ── App lifecycle ───────────────────────────────────────────────────
app.whenReady().then(() => {
  console.log('🚀 App ready, starting up...');
  if (process.platform === 'darwin') app.dock.hide();

  initSettings();
  initAnalytics();
  killStalePorts();
  
  try { createTray(); } catch(e) { console.error('Tray error:', e); }

  if (isFirstLaunch()) {
    if (process.platform === 'darwin') app.dock.show();
    startPostOnboarding();
    // Wait for overlay warmup before showing onboarding to avoid lag
    const waitForReady = setInterval(() => {
      if (overlayReady) {
        clearInterval(waitForReady);
        showOnboarding();
      }
    }, 100);
    // Safety timeout — show anyway after 3s
    setTimeout(() => {
      clearInterval(waitForReady);
      if (!onboardingWin) showOnboarding();
    }, 3000);
  } else {
    startPostOnboarding();
  }
}).catch(err => {
  console.error('❌ Startup failed:', err);
});

app.on('window-all-closed', (e) => e.preventDefault());
