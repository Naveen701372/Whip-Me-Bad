# Desktop App Blueprint

How we build menu-bar Electron apps — from scaffold to ship.
Extracted from the Whip Me Bad project. Use this as a skill/boilerplate for any new desktop tool.

---

## Architecture

```
my-app/
├── main.js                  # Electron main process — app lifecycle, tray, IPC, windows
├── src/
│   ├── preload.js           # Context bridge — exposes safe IPC to renderer
│   ├── overlay.html         # Transparent fullscreen window (if needed)
│   ├── tray-popup.html      # Tray popup UI (nodeIntegration: true, no preload)
│   ├── onboarding.html      # First-launch experience (uses preload)
│   └── analytics.js         # Silent telemetry module (optional)
├── assets/
│   ├── icons/
│   │   ├── logo.png         # App icon (1024x1024 source)
│   │   ├── logo.icns        # macOS icon
│   │   ├── logo.ico         # Windows icon
│   │   ├── logo-256.png     # Windows builder needs this
│   │   └── Tray-icon.png    # Menu bar icon (22x22 @2x, template image)
│   └── sounds/              # Audio assets if needed
├── bin/
│   └── my-app.js            # CLI entry for `npx my-app` usage
├── build/
│   └── entitlements.mac.plist
├── package.json
├── .gitignore
└── .github/
    └── workflows/
        └── publish.yml      # Auto-publish to npm on GitHub Release
```

---

## 1. Project Init

```bash
mkdir my-app && cd my-app
npm init -y
npm install --save-dev electron electron-builder
```

---

## 2. package.json — The Full Config

This is the single source of truth for app metadata, build config, and scripts.

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "description": "Short description",
  "author": "Name <email>",
  "license": "MIT",
  "repository": { "type": "git", "url": "https://github.com/user/my-app.git" },
  "homepage": "https://github.com/user/my-app",
  "keywords": ["electron", "desktop", "menu-bar"],
  "publishConfig": { "registry": "https://registry.npmjs.org/" },
  "main": "main.js",
  "bin": { "my-app": "bin/my-app.js" },
  "scripts": {
    "start": "electron .",
    "dev": "electron .",
    "build": "electron-builder --mac",
    "build:dmg": "electron-builder --mac dmg",
    "build:zip": "electron-builder --mac zip",
    "build:win": "electron-builder --win",
    "build:all": "electron-builder --mac --win"
  },
  "build": {
    "appId": "com.yourname.my-app",
    "productName": "My App",
    "mac": {
      "category": "public.app-category.developer-tools",
      "icon": "assets/icons/logo.png",
      "target": ["dmg", "zip"],
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist",
      "extendInfo": { "LSUIElement": true }
    },
    "dmg": {
      "title": "My App",
      "backgroundColor": "#0a0608",
      "contents": [
        { "x": 130, "y": 220 },
        { "x": 410, "y": 220, "type": "link", "path": "/Applications" }
      ]
    },
    "win": {
      "target": ["nsis", "portable"],
      "icon": "assets/icons/logo-256.png"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": true,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "My App"
    },
    "files": ["main.js", "src/**/*", "assets/**/*"],
    "extraResources": []
  },
  "dependencies": {},
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.1.8"
  }
}
```

Key points:
- `LSUIElement: true` — hides from Dock on macOS (menu-bar-only app)
- `hardenedRuntime: true` — required for macOS notarization
- `bin` field — enables `npx my-app` after npm install
- `files` array — controls what goes into the built app

---

## 3. main.js — Core Patterns

### App Lifecycle

```js
const { app, BrowserWindow, ipcMain, screen, Tray, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Settings persistence ──
let SETTINGS_PATH = '';
const defaults = { paused: false, volume: 0.85 };
let settings = { ...defaults };

function initSettings() {
  SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
  try {
    if (fs.existsSync(SETTINGS_PATH))
      Object.assign(settings, JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')));
  } catch (_) {}
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (_) {}
}

function isFirstLaunch() { return !fs.existsSync(SETTINGS_PATH); }
```

### Single Instance Lock

```js
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
app.on('second-instance', () => { if (tray) tray.popUpContextMenu(); });
```

### Tray Icon

```js
let tray = null;

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icons', 'Tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(false);
  tray = new Tray(icon);
  tray.setToolTip('My App');
  tray.on('click', () => showTrayPopup());
}
```

### Tray Popup Window

```js
let trayPopup = null;

function showTrayPopup() {
  if (trayPopup) { trayPopup.close(); trayPopup = null; return; }

  const trayBounds = tray.getBounds();
  const popupWidth = 280, popupHeight = 360;
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - popupWidth / 2);
  let y = process.platform === 'darwin'
    ? trayBounds.y + trayBounds.height + 4
    : trayBounds.y - popupHeight - 4;

  trayPopup = new BrowserWindow({
    x, y, width: popupWidth, height: popupHeight,
    frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  trayPopup.loadFile('src/tray-popup.html');
  trayPopup.once('ready-to-show', () => {
    trayPopup.show();
    trayPopup.webContents.send('init-settings', settings);
  });
  trayPopup.on('blur', () => { if (trayPopup) { trayPopup.close(); trayPopup = null; } });
  trayPopup.on('closed', () => { trayPopup = null; });
}
```

### Transparent Overlay Window (optional)

```js
function createOverlay() {
  const { bounds } = screen.getPrimaryDisplay();
  const winOptions = {
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    transparent: true, frame: false, alwaysOnTop: true,
    focusable: false, skipTaskbar: true, resizable: false,
    hasShadow: false, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      backgroundThrottling: false,
    },
  };
  if (process.platform === 'darwin') winOptions.type = 'panel';

  const overlay = new BrowserWindow(winOptions);
  if (process.platform === 'darwin') overlay.setAlwaysOnTop(true, 'screen-saver', 1);
  else overlay.setAlwaysOnTop(true);
  overlay.setIgnoreMouseEvents(true);
  overlay.loadFile('src/overlay.html');
}
```

### App Ready

```js
app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  initSettings();
  createTray();

  if (isFirstLaunch()) {
    if (process.platform === 'darwin') app.dock.show();
    showOnboarding();
  } else {
    startApp();
  }
});

app.on('window-all-closed', (e) => e.preventDefault());
```

---

## 4. Preload — Context Bridge

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  onSomeEvent: (fn) => ipcRenderer.on('some-event', (_, data) => fn(data)),
  sendAction: (data) => ipcRenderer.send('action', data),
  invokeAsync: () => ipcRenderer.invoke('get-something'),
});
```

Rules:
- Overlay and onboarding windows use preload (contextIsolation: true)
- Tray popup uses nodeIntegration: true (simpler, it's a trusted local UI)

---

## 5. Tray Popup HTML Pattern

```html
<script>
const { ipcRenderer } = require('electron');

ipcRenderer.on('init-settings', (_, settings) => {
  // Populate UI from settings
});

// Send actions back to main
function togglePause() { ipcRenderer.send('toggle-pause'); }
function quit() { ipcRenderer.send('quit-app'); }
</script>
```

Design system approach:
- CSS variables for theming (dark default + `@media (prefers-color-scheme: light)`)
- Inter or DM Sans from Google Fonts
- Compact layout: 280px wide, groups with rounded cards
- Icon buttons for actions, sliders for values, pills for status

---

## 6. bin/ CLI Entry

```js
#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const electronPath = (() => {
  try { return require('electron'); } catch (_) {
    console.error('Electron not found. Install it: npm install -g electron');
    process.exit(1);
  }
})();

const child = spawn(electronPath, [path.join(__dirname, '..')], {
  stdio: 'inherit', detached: true,
});
child.unref();
```

This enables: `npx my-app` or `npm install -g my-app && my-app`

---

## 7. macOS Entitlements

`build/entitlements.mac.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key><true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key><true/>
    <key>com.apple.security.automation.apple-events</key><true/>
</dict>
</plist>
```

---

## 8. Silent Analytics (Optional)

Pattern: queue events locally, batch-flush to Supabase via edge function.

```js
const queue = [];
const FLUSH_INTERVAL = 10000;

function track(eventType, meta) {
  queue.push({ device_id: deviceId, session_id: sessionId, trigger_type: eventType, ... });
}

async function flush() {
  if (!queue.length) return;
  const batch = queue.splice(0, 50);
  try {
    await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(batch),
    });
  } catch (_) { queue.unshift(...batch); }
}

setInterval(flush, FLUSH_INTERVAL);
```

Edge function handles server-side enrichment (region from IP, etc.) so the client stays thin.

Device ID: generate a UUID once, persist to `app.getPath('userData')/device-id.txt`.
Session ID: new UUID per app launch.

---

## 9. Build & Ship

### Build locally

```bash
npm run build:dmg    # macOS DMG
npm run build:win    # Windows NSIS installer + portable EXE
npm run build:all    # Both
```

Outputs land in `dist/`.

### Publish to npm

```bash
npm login
npm publish
```

### GitHub Actions — Auto-publish on Release

`.github/workflows/publish.yml`:
```yaml
name: Publish Package
on:
  release:
    types: [published]

jobs:
  publish-npm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Release flow

1. Bump version in `package.json`
2. `git commit -m "release: vX.Y.Z — description"`
3. `git tag vX.Y.Z`
4. `git push origin main --tags`
5. `npm run build:all`
6. Create GitHub Release → attach DMG + EXE → publish
7. GitHub Action auto-publishes to npm

---

## 10. .gitignore

```
node_modules/
dist/
build/icon.icns
build/icon.ico
*.dmg
*.exe
*.AppImage
*.mov
.DS_Store
```

---

## 11. IPC Patterns Summary

| Direction | Method | Use |
|-----------|--------|-----|
| Main → Renderer | `win.webContents.send(channel, data)` | Push state/events to UI |
| Renderer → Main (fire & forget) | `ipcRenderer.send(channel, data)` | Button clicks, toggles |
| Renderer → Main (async response) | `ipcRenderer.invoke(channel)` / `ipcMain.handle` | Get data back |
| Renderer listens | `ipcRenderer.on(channel, callback)` | React to main process events |

---

## 12. Window Types We Use

| Window | frame | transparent | nodeIntegration | contextIsolation | preload | Purpose |
|--------|-------|-------------|-----------------|------------------|---------|---------|
| Tray popup | false | true | true | false | none | Settings/controls |
| Overlay | false | true | false | true | yes | Fullscreen visual effects |
| Onboarding | false | true | false | true | yes | First-launch experience |
| Insights/modal | false | false | false | true | yes | Data display |

---

## 13. Platform Differences

| Concern | macOS | Windows |
|---------|-------|---------|
| Hide from Dock | `app.dock.hide()` + `LSUIElement: true` | N/A (skipTaskbar) |
| Tray popup position | Below tray icon | Above tray icon |
| Overlay always-on-top | `setAlwaysOnTop(true, 'screen-saver', 1)` | `setAlwaysOnTop(true)` |
| Overlay window type | `type: 'panel'` | default |
| App icon | `.icns` | `.ico` / `.png 256x256` |
| Installer | DMG | NSIS |

---

## Quick Start Checklist

- [ ] `npm init` + install electron + electron-builder
- [ ] Create `main.js` with tray + single instance lock + settings persistence
- [ ] Create `src/preload.js` with context bridge
- [ ] Create `src/tray-popup.html` with settings UI
- [ ] Create tray icon asset (22x22 @2x PNG)
- [ ] Create app icons (logo.png, logo.icns, logo.ico, logo-256.png)
- [ ] Add `build/entitlements.mac.plist`
- [ ] Add `bin/my-app.js` for npx support
- [ ] Add `.github/workflows/publish.yml`
- [ ] Test: `npm start`
- [ ] Build: `npm run build:all`
- [ ] Ship: tag → push → GitHub Release → npm publish
