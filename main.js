const {
  app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, dialog, shell
} = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const dgram = require('dgram');
const http = require('http');
const fs = require('fs');
const { startAutoInstaller, stopAutoInstaller, installInDirectory } = require('./src/hook-installer');
const { initAnalytics, stopAnalytics, track } = require('./src/analytics');

// ── Settings persistence ────────────────────────────────────────────
let SETTINGS_PATH = '';

const defaults = {
  paused: false,
  volume: 0.85,
  watchFolder: path.join(require('os').homedir(), 'Dev'),
  enterTrigger: true,
  triggerKey: 'Enter',       // key name for display
  triggerKeyCode: 36,        // macOS keycode (36=Return, 76=NumpadEnter)
  triggerVkCode: 13,         // Windows virtual key code (13=Enter)
  customWhoosh: '',          // path to custom whoosh mp3 (empty = default)
  customSlap: '',            // path to custom slap mp3 (empty = default)
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
  const winOptions = {
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
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      backgroundThrottling: false,
    },
  };

  // macOS-specific options
  if (process.platform === 'darwin') {
    winOptions.type = 'panel';
  }

  overlay = new BrowserWindow(winOptions);

  if (process.platform === 'darwin') {
    overlay.setAlwaysOnTop(true, 'screen-saver', 1);
  } else {
    overlay.setAlwaysOnTop(true);
  }
  overlay.setIgnoreMouseEvents(true);
  overlayReady = false;

  overlay.loadFile('src/overlay.html');
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
function triggerWhip(label) {
  if (settings.paused) return;
  if (cooldown || !overlayReady) return;
  cooldown = true;
  setTimeout(() => { cooldown = false; }, COOLDOWN_MS);
  overlay.webContents.send('set-volume', settings.volume);
  overlay.webContents.send('trigger-whip', label || '');
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

function triggerFromHook(hookType, label) {
  if (enterTimer) {
    clearTimeout(enterTimer);
    enterTimer = null;
  }
  triggerWhip(label);
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

// ── Tray Popup Window ────────────────────────────────────────────────
let trayPopup = null;

function showTrayPopup() {
  if (trayPopup) {
    trayPopup.close();
    trayPopup = null;
    return;
  }

  const trayBounds = tray.getBounds();
  const popupWidth = 280;
  const popupHeight = 360;

  // Position below tray icon (macOS) or above (Windows)
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - popupWidth / 2);
  let y;
  if (process.platform === 'darwin') {
    y = trayBounds.y + trayBounds.height + 4;
  } else {
    y = trayBounds.y - popupHeight - 4;
  }

  trayPopup = new BrowserWindow({
    x, y,
    width: popupWidth,
    height: popupHeight,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  trayPopup.loadFile('src/tray-popup.html');

  trayPopup.once('ready-to-show', () => {
    trayPopup.show();
    // Send current settings
    trayPopup.webContents.send('init-settings', {
      paused: settings.paused,
      volume: settings.volume,
      customWhoosh: settings.customWhoosh,
      customSlap: settings.customSlap,
      triggerKey: settings.triggerKey,
      enterTrigger: settings.enterTrigger,
    });
  });

  // Close when clicking outside
  trayPopup.on('blur', () => {
    if (trayPopup) { trayPopup.close(); trayPopup = null; }
  });
  trayPopup.on('closed', () => { trayPopup = null; });
}

// ── Tray popup IPC handlers ─────────────────────────────────────────
ipcMain.on('toggle-pause', () => {
  settings.paused = !settings.paused;
  saveSettings();
});

ipcMain.on('set-volume-setting', (_, vol) => {
  settings.volume = vol;
  saveSettings();
});

ipcMain.on('change-whoosh', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose whoosh sound',
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    settings.customWhoosh = result.filePaths[0];
    saveSettings();
    sendSoundPaths();
    if (trayPopup) trayPopup.webContents.send('init-settings', settings);
  }
});

ipcMain.on('change-slap', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose slap sound',
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    settings.customSlap = result.filePaths[0];
    saveSettings();
    sendSoundPaths();
    if (trayPopup) trayPopup.webContents.send('init-settings', settings);
  }
});

ipcMain.on('change-key', () => {
  showKeyCapture();
});

ipcMain.on('show-insights', () => {
  showInsights();
  if (trayPopup) { trayPopup.close(); trayPopup = null; }
});

ipcMain.on('open-login', () => {
  const current = app.getLoginItemSettings().openAtLogin;
  app.setLoginItemSettings({ openAtLogin: !current });
});

ipcMain.on('quit-app', () => {
  stopAutoInstaller();
  stopAnalytics();
  if (keyMonitor) keyMonitor.kill();
  app.quit();
});

ipcMain.on('reset-sounds', () => {
  settings.customWhoosh = '';
  settings.customSlap = '';
  saveSettings();
  sendSoundPaths();
});

ipcMain.on('reset-one-sound', (_, type) => {
  if (type === 'whoosh') settings.customWhoosh = '';
  else if (type === 'slap') settings.customSlap = '';
  saveSettings();
  sendSoundPaths();
});

ipcMain.on('reset-trigger', () => {
  settings.triggerKey = 'Enter';
  settings.triggerKeyCode = 36;
  settings.triggerVkCode = 13;
  settings.enterTrigger = true;
  saveSettings();
  if (keyMonitor) { keyMonitor.kill(); keyMonitor = null; }
  startKeyMonitor();
});

function updateTray() {
  if (tray) {
    tray.setToolTip(settings.paused ? 'Whip Me Bad (Paused)' : 'Whip Me Bad 🍑');
  }
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'assets', 'icons', 'Tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(false);
    tray = new Tray(icon);
    tray.setToolTip('Whip Me Bad 🍑');
    tray.on('click', () => showTrayPopup());
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
  if (process.platform === 'darwin') {
    startMacKeyMonitor();
  } else if (process.platform === 'win32') {
    startWinKeyMonitor();
  }
}

function startMacKeyMonitor() {
  const keyCode1 = settings.triggerKeyCode || 36;
  const keyCode2 = keyCode1 === 36 ? 76 : keyCode1; // 76=NumpadEnter if main is Enter
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
      if keyCode == ${keyCode1} || keyCode == ${keyCode2} {
        print("TRIGGER", terminator: "\\n")
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
      if (line === 'TRIGGER') triggerFromEnter();
    }
  });

  keyMonitor.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg === 'READY') {
      console.log(`🔥 Key monitor active (macOS) — trigger: ${settings.triggerKey}`);
    } else if (msg.includes('Failed to create event tap')) {
      console.error('⚠️  Accessibility permission required!');
      console.error('   System Settings → Privacy & Security → Accessibility');
    }
  });

  keyMonitor.on('close', (code) => {
    if (code !== 0) console.error(`Key monitor exited with code ${code}`);
  });

  app.on('before-quit', () => { if (keyMonitor) keyMonitor.kill(); });
}

function startWinKeyMonitor() {
  const vkCode = settings.triggerVkCode || 13;
  const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;

public class KeyHook {
    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    
    [DllImport("user32.dll")]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
    
    [DllImport("user32.dll")]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);
    
    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    
    [DllImport("kernel32.dll")]
    private static extern IntPtr GetModuleHandle(string lpModuleName);
    
    [DllImport("user32.dll")]
    private static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
    
    [StructLayout(LayoutKind.Sequential)]
    private struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public POINT pt; }
    
    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int x; public int y; }
    
    private static IntPtr hookId = IntPtr.Zero;
    private static LowLevelKeyboardProc proc = HookCallback;
    
    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && (int)wParam == 0x0100) {
            int vkCode = Marshal.ReadInt32(lParam);
            if (vkCode == ${vkCode}) {
                Console.WriteLine("TRIGGER");
                Console.Out.Flush();
            }
        }
        return CallNextHookEx(hookId, nCode, wParam, lParam);
    }
    
    public static void Start() {
        using (var curProcess = Process.GetCurrentProcess())
        using (var curModule = curProcess.MainModule) {
            hookId = SetWindowsHookEx(13, proc, GetModuleHandle(curModule.ModuleName), 0);
        }
        Console.Error.WriteLine("READY");
        Console.Error.Flush();
        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0)) { }
    }
}
"@
[KeyHook]::Start()
`;

  keyMonitor = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  keyMonitor.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line.trim() === 'TRIGGER') triggerFromEnter();
    }
  });

  keyMonitor.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg === 'READY') {
      console.log(`🔥 Key monitor active (Windows) — trigger: ${settings.triggerKey}`);
    } else if (msg) {
      console.log('monitor:', msg);
    }
  });

  keyMonitor.on('close', (code) => {
    if (code !== 0) console.error(`Key monitor exited with code ${code}`);
  });

  app.on('before-quit', () => { if (keyMonitor) keyMonitor.kill(); });
}

// ── Onboarding ──────────────────────────────────────────────────────

function showInsights() {
  if (insightsWin) { insightsWin.focus(); return; }
  const { getStats } = require('./src/analytics');
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
      preload: path.join(__dirname, 'src', 'preload.js'),
    },
  });

  insightsWin.loadFile('src/insights.html', {
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
      preload: path.join(__dirname, 'src', 'preload.js'),
      backgroundThrottling: false,
    },
  });

  onboardingWin.setAlwaysOnTop(true, 'screen-saver');
  onboardingWin.loadFile('src/onboarding.html');
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
  // Send custom sound paths to overlay after it's ready
  const waitForOverlay = setInterval(() => {
    if (overlayReady) {
      clearInterval(waitForOverlay);
      sendSoundPaths();
    }
  }, 200);
  console.log('🍑 Whip Me Bad is running!');
}

function sendSoundPaths() {
  if (overlay && overlayReady) {
    overlay.webContents.send('set-sounds', {
      whoosh: settings.customWhoosh || '',
      slap: settings.customSlap || '',
    });
  }
}

// ── Key Capture Window ──────────────────────────────────────────────
let keyCaptureWin = null;

function showKeyCapture() {
  if (keyCaptureWin) { keyCaptureWin.focus(); return; }

  keyCaptureWin = new BrowserWindow({
    width: 340,
    height: 200,
    center: true,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
    },
  });

  keyCaptureWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html><html><head>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{background:rgba(12,10,16,0.95);color:#fff;font-family:'DM Sans',sans-serif;
        display:flex;align-items:center;justify-content:center;height:100vh;
        flex-direction:column;-webkit-app-region:drag;border-radius:16px}
      h2{font-size:18px;font-weight:600;color:rgba(255,240,220,.9);margin-bottom:8px}
      p{font-size:13px;color:rgba(255,200,150,.4);margin-bottom:20px}
      .key{font-size:24px;font-weight:700;color:rgba(255,180,100,.8);
        background:rgba(255,120,30,.1);padding:12px 32px;border-radius:12px;
        min-width:80px;text-align:center}
      .hint{font-size:11px;color:rgba(255,200,150,.25);margin-top:12px}
    </style></head><body>
    <h2>Press a key</h2>
    <p>This will be your whip trigger</p>
    <div class="key" id="key">...</div>
    <div class="hint">Press Escape to cancel</div>
    <script>
      document.addEventListener('keydown', (e) => {
        e.preventDefault();
        if (e.key === 'Escape') {
          window.bridge.keyCaptured(null);
          return;
        }
        document.getElementById('key').textContent = e.key === ' ' ? 'Space' : e.key;
        window.bridge.keyCaptured({
          key: e.key === ' ' ? 'Space' : e.key,
          keyCode: e.keyCode,
          code: e.code,
        });
      });
    </script></body></html>
  `)}`);

  keyCaptureWin.once('ready-to-show', () => keyCaptureWin.show());
  keyCaptureWin.on('closed', () => { keyCaptureWin = null; });
}

ipcMain.on('key-captured', (_, data) => {
  if (keyCaptureWin) {
    keyCaptureWin.close();
    keyCaptureWin = null;
  }
  if (data) {
    settings.triggerKey = data.key;
    // Map common keys to macOS keycodes
    const macKeyCodes = { Enter: 36, Space: 49, Tab: 48, Backspace: 51 };
    const winVkCodes = { Enter: 13, Space: 32, Tab: 9, Backspace: 8 };
    settings.triggerKeyCode = macKeyCodes[data.key] || data.keyCode;
    settings.triggerVkCode = winVkCodes[data.key] || data.keyCode;
    settings.enterTrigger = true;
    saveSettings();
    updateTray();
    // Restart key monitor with new key
    if (keyMonitor) {
      keyMonitor.kill();
      keyMonitor = null;
    }
    startKeyMonitor();
  }
});

// ── Kill stale ports ────────────────────────────────────────────────
function killStalePorts() {
  for (const port of [31337, 31338]) {
    try {
      if (process.platform === 'win32') {
        // Windows: find and kill processes on port
        const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' }).trim();
        const lines = result.split('\n');
        for (const line of lines) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && pid !== String(process.pid)) {
            try { execSync(`taskkill /PID ${pid} /F`); } catch (_) {}
          }
        }
      } else {
        // macOS/Linux
        const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
        if (pids) {
          const myPid = String(process.pid);
          const otherPids = pids.split('\n').filter(p => p !== myPid);
          if (otherPids.length) {
            execSync(`kill -9 ${otherPids.join(' ')}`);
            console.log(`🧹 Killed stale process(es) on port ${port}`);
          }
        }
      }
    } catch (_) {}
  }
}

// ── HTTP + UDP listeners ────────────────────────────────────────────
function startTriggerListeners() {
  const httpServer = http.createServer((req, res) => {
    if (req.url.startsWith('/whip')) {
      const url = new URL(req.url, 'http://localhost');
      const hookType = url.searchParams.get('type') || 'kiro_hook';
      const label = url.searchParams.get('label') || '';
      triggerFromHook(hookType, label);
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
