#!/usr/bin/env node
'use strict';

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Config ──────────────────────────────────────────────────────────
const INSTALL_DIR = path.join(os.homedir(), '.whip-me-bad');
const REPO_OWNER = 'heynaavi';
const REPO_NAME = 'Whip-Me-Bad';
const VERSION = require('../package.json').version;

// ── Pretty logging ──────────────────────────────────────────────────
const PINK = '\x1b[38;5;205m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

function log(msg) { console.log(`  ${PINK}▸${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${RED}✖${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }

// ── Resolve binary path ─────────────────────────────────────────────
function getBinaryPath() {
  if (process.platform === 'darwin') {
    return path.join(INSTALL_DIR, 'Whip Me Bad.app', 'Contents', 'MacOS', 'Whip Me Bad');
  } else if (process.platform === 'win32') {
    return path.join(INSTALL_DIR, 'Whip Me Bad.exe');
  }
  return null;
}

function getAppPath() {
  if (process.platform === 'darwin') {
    return path.join(INSTALL_DIR, 'Whip Me Bad.app');
  } else if (process.platform === 'win32') {
    return path.join(INSTALL_DIR, 'Whip Me Bad.exe');
  }
  return null;
}

// ── Launch ──────────────────────────────────────────────────────────
function launch() {
  const binaryPath = getBinaryPath();
  const appPath = getAppPath();

  if (!binaryPath || !appPath) {
    fail(`Unsupported platform: ${process.platform}`);
    process.exit(1);
  }

  if (!fs.existsSync(binaryPath)) {
    console.log('');
    fail('Whip Me Bad is not installed yet.');
    console.log('');
    log('Try reinstalling:');
    console.log(`  ${DIM}npm install -g whip-me-bad${RESET}`);
    console.log('');
    log('Or download manually:');
    console.log(`  ${DIM}https://github.com/${REPO_OWNER}/${REPO_NAME}/releases${RESET}`);
    console.log('');
    process.exit(1);
  }

  if (process.platform === 'darwin') {
    // Use 'open' on macOS — it handles .app bundles properly
    const child = spawn('open', ['-a', appPath], {
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
  } else {
    // Windows — launch the exe directly
    const child = spawn(binaryPath, [], {
      stdio: 'ignore',
      detached: true,
      windowsHide: false,
    });
    child.unref();
  }

  console.log(`${PINK}${BOLD}  🍑 Whip Me Bad launched!${RESET}`);
}

launch();
