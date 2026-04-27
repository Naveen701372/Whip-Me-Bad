// ═══════════════════════════════════════════════════════════════════════
//  Whip Me Bad — Silent Analytics via Supabase
//  Counts slaps/whips with trigger type, batches and sends when online.
//  Fully silent — never notifies user, never throws, never blocks.
// ═══════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const https = require('https');
const { app } = require('electron');

const SUPABASE_URL = 'https://azgmndwisctadoousbij.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6Z21uZHdpc2N0YWRvb3VzYmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDY3NDEsImV4cCI6MjA4NjkyMjc0MX0.T0gs_PPHSBKyOYf3W7nfKGqJN86cvrXPmCPF4PxI9r0';

let QUEUE_PATH = '';
let DEVICE_PATH = '';

const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/track-whip`;
const FLUSH_INTERVAL_MS = 10000; // 10s for faster debugging
const MAX_QUEUE_SIZE = 500;

let queue = [];
let deviceId = '';
let sessionId = '';
let totalSlaps = 0;

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function getDeviceId() {
  try {
    if (fs.existsSync(DEVICE_PATH)) return fs.readFileSync(DEVICE_PATH, 'utf8').trim();
  } catch (_) {}
  const id = uuid();
  try { fs.writeFileSync(DEVICE_PATH, id); } catch (_) {}
  return id;
}

function loadQueue() {
  try {
    if (fs.existsSync(QUEUE_PATH)) {
      const data = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
      if (Array.isArray(data)) queue = data.slice(-MAX_QUEUE_SIZE);
    }
  } catch (_) { queue = []; }
}

function saveQueue() {
  try { fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE))); } catch (_) {}
}

function track(triggerType, meta) {
  totalSlaps++;
  const event = {
    device_id: deviceId,
    session_id: sessionId,
    trigger_type: triggerType,
    total_slaps: totalSlaps,
    app_version: app.getVersion(),
    platform: process.platform,
  };
  if (meta) event.meta = JSON.stringify(meta);
  queue.push(event);
  if (queue.length > MAX_QUEUE_SIZE) queue = queue.slice(-MAX_QUEUE_SIZE);
}

function trackEvent(eventType, meta) {
  queue.push({
    device_id: deviceId,
    session_id: sessionId,
    trigger_type: eventType,
    total_slaps: totalSlaps,
    app_version: app.getVersion(),
    platform: process.platform,
    meta: meta ? JSON.stringify(meta) : null,
  });
  if (queue.length > MAX_QUEUE_SIZE) queue = queue.slice(-MAX_QUEUE_SIZE);
}

function detectKiro() {
  const os = require('os');
  const home = os.homedir();
  // Check for Kiro installation indicators
  const kiroIndicators = [
    path.join(home, '.kiro'),
    process.platform === 'darwin' ? '/Applications/Kiro.app' : '',
    process.platform === 'win32' ? path.join(home, 'AppData', 'Local', 'Programs', 'kiro') : '',
  ].filter(Boolean);

  for (const p of kiroIndicators) {
    try { if (fs.existsSync(p)) return true; } catch (_) {}
  }
  return false;
}

async function flush() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, 50);
  console.log(`📊 Flushing ${batch.length} events via edge function...`);

  try {
    const result = await supabaseInsert(batch);
    console.log(`📊 ✅ Flushed ${batch.length} events — region: ${result.region || 'n/a'}`);
    saveQueue();
  } catch (err) {
    console.log(`📊 ❌ Flush failed: ${err.message}`);
    queue.unshift(...batch);
    saveQueue();
  }
}

function supabaseInsert(rows) {
  return new Promise((resolve, reject) => {
    const cleanRows = rows.map(r => {
      const clean = { ...r };
      if (!clean.meta) delete clean.meta;
      return clean;
    });
    const payload = JSON.stringify(cleanRows);
    const url = new URL(EDGE_FUNCTION_URL);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 8000,
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); } catch (_) { resolve({}); }
        } else {
          console.log(`📊 Edge fn response ${res.statusCode}: ${body}`);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

let flushTimer = null;

function initAnalytics() {
  QUEUE_PATH = path.join(app.getPath('userData'), 'analytics-queue.json');
  DEVICE_PATH = path.join(app.getPath('userData'), 'device-id.txt');
  deviceId = getDeviceId();
  sessionId = uuid();
  loadQueue();

  // Track session start with Kiro detection
  const hasKiro = detectKiro();
  trackEvent('session_start', { hasKiro, platform: process.platform });

  flushTimer = setInterval(() => flush().catch(() => {}), FLUSH_INTERVAL_MS);
  app.on('before-quit', () => { saveQueue(); flush().catch(() => {}); });
}

function stopAnalytics() {
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  saveQueue();
}

function getStats() {
  return { totalSlaps, queueSize: queue.length, deviceId, sessionId };
}

module.exports = { initAnalytics, stopAnalytics, track, trackEvent, detectKiro, flush, getStats };
