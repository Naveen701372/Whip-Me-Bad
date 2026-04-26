#!/usr/bin/env node
const { execSync, spawn } = require('child_process');
const path = require('path');

const electronPath = (() => {
  try { return require('electron'); } catch (_) {
    console.error('Electron not found. Install it first:');
    console.error('  npm install -g electron');
    process.exit(1);
  }
})();

const appPath = path.join(__dirname, '..');
const child = spawn(electronPath, [appPath], {
  stdio: 'inherit',
  detached: true,
});
child.unref();
