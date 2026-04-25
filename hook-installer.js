// ═══════════════════════════════════════════════════════════════════════
//  Whip Me Bad — Auto Hook Installer (async, non-blocking)
//  Scans for .kiro/ folders and installs whip hooks into Kiro projects.
//  All I/O is async to never block the main Electron process.
// ═══════════════════════════════════════════════════════════════════════
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

const HOOK_FILES = ['whip-me-prompt.kiro.hook', 'whip-me-task.kiro.hook', 'whip-me-agent-stop.kiro.hook', 'whip-me-tool-use.kiro.hook'];
const SCAN_INTERVAL_MS = 120000; // re-scan every 2 minutes (not 30s)
const installedProjects = new Set();

function getHookTemplatesDir() {
  const devPath = path.join(__dirname, 'hooks');
  if (fsSync.existsSync(devPath)) return devPath;
  try {
    // Packaged app — extraResources
    const pkgPath = path.join(process.resourcesPath, 'hooks');
    if (fsSync.existsSync(pkgPath)) return pkgPath;
  } catch (_) {}
  // Fallback for asar
  try {
    const asarPath = path.join(__dirname, '..', 'hooks');
    if (fsSync.existsSync(asarPath)) return asarPath;
  } catch (_) {}
  return null;
}

async function getScanRoots() {
  const home = os.homedir();
  const roots = [];

  for (const dir of ['Dev', 'Projects', 'Code', 'repos', 'src', 'work', 'workspace', 'Desktop', 'Documents']) {
    const full = path.join(home, dir);
    try { await fs.access(full); roots.push(full); } catch (_) {}
  }

  // Year-based folders like ~/Dev/2026/
  const devDir = path.join(home, 'Dev');
  try {
    const entries = await fs.readdir(devDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && /^\d{4}$/.test(entry.name)) {
        roots.push(path.join(devDir, entry.name));
      }
    }
  } catch (_) {}

  return roots;
}

async function installHooksInProject(projectDir) {
  const kiroHooksDir = path.join(projectDir, '.kiro', 'hooks');
  const templateDir = getHookTemplatesDir();
  if (!templateDir) return false;

  try { await fs.mkdir(kiroHooksDir, { recursive: true }); } catch (_) {}

  let installed = 0;
  for (const hookFile of HOOK_FILES) {
    const src = path.join(templateDir, hookFile);
    const dest = path.join(kiroHooksDir, hookFile);

    try { await fs.access(src); } catch (_) { continue; }

    try {
      await fs.access(dest);
      // File exists — check if it's ours
      const content = await fs.readFile(dest, 'utf8');
      if (content.includes('Whip Me Bad')) continue; // already installed
      continue; // different hook, don't overwrite
    } catch (_) {
      // Doesn't exist — install it
    }

    try {
      await fs.copyFile(src, dest);
      installed++;
    } catch (err) {
      console.warn(`⚠️  Failed to install ${hookFile} in ${projectDir}:`, err.message);
    }
  }

  if (installed > 0) console.log(`🍑 Installed ${installed} hook(s) in ${projectDir}`);
  return installed > 0;
}

async function scanAndInstall() {
  const roots = await getScanRoots();
  let totalInstalled = 0;

  for (const root of roots) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const projectDir = path.join(root, entry.name);
        if (installedProjects.has(projectDir)) continue;

        const kiroDir = path.join(projectDir, '.kiro');
        try { await fs.access(kiroDir); } catch (_) { continue; }

        if (await installHooksInProject(projectDir)) totalInstalled++;
        installedProjects.add(projectDir);
      }
    } catch (_) {}
  }

  if (totalInstalled > 0) console.log(`🍑 Auto-installed hooks in ${totalInstalled} new project(s)`);
}

let scanTimer = null;

function startAutoInstaller() {
  console.log('🔍 Whip Me Bad — scanning for Kiro projects...');
  // Run first scan after a delay so it doesn't compete with app startup
  setTimeout(() => {
    scanAndInstall().catch(() => {});
    scanTimer = setInterval(() => scanAndInstall().catch(() => {}), SCAN_INTERVAL_MS);
  }, 3000);
}

function stopAutoInstaller() {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
}

async function installInDirectory(dir) {
  const kiroDir = path.join(dir, '.kiro');
  await fs.mkdir(path.join(kiroDir, 'hooks'), { recursive: true });
  return installHooksInProject(dir);
}

module.exports = { startAutoInstaller, stopAutoInstaller, installInDirectory, scanAndInstall };
