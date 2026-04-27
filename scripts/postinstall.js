#!/usr/bin/env node
'use strict';

// Run the real installer as a child process.
const { execFileSync } = require('child_process');
const path = require('path');

try {
  execFileSync(process.execPath, [path.join(__dirname, 'install-binary.js')], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
} catch (_) {
  // Never fail the npm install
}
