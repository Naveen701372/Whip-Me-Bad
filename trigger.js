#!/usr/bin/env node
// Standalone trigger script — can be called from Kiro hooks
// Sends a signal to the running Kiro Whip app to fire a whip
// Tries HTTP first (reliable), falls back to UDP

const http = require('http');
const dgram = require('dgram');

const req = http.get('http://127.0.0.1:31338/whip', { timeout: 500 }, (res) => {
  console.log('⚡ Whip triggered! (HTTP)');
});

req.on('error', () => {
  // HTTP failed — fall back to UDP
  const msg = Buffer.from('WHIP');
  const client = dgram.createSocket('udp4');
  client.send(msg, 0, msg.length, 31337, '127.0.0.1', (err) => {
    client.close();
    if (err) console.error('Could not trigger whip:', err.message);
    else console.log('⚡ Whip triggered! (UDP fallback)');
  });
});

req.on('timeout', () => {
  req.destroy();
});
