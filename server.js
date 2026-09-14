#!/usr/bin/env node
'use strict';
// CLI entry point: runs the LAN Drop server from ./config and ./data.
const fs = require('fs');
const path = require('path');
const { createLanDrop } = require('./lib/server');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'config', 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('Not set up yet. Run:  npm run setup');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
if (process.env.PORT) config.port = Number(process.env.PORT);

const drop = createLanDrop({ config, dataDir: path.join(ROOT, 'data'), allowPublic: process.env.DROP_ALLOW_PUBLIC === '1' });

drop.start().then(() => {
  const u = drop.urls();
  console.log('LAN Drop is running (end-to-end encrypted, items expire after %dh)\n', config.ttlHours);
  console.log('Open one of these on any device on the same network:');
  for (const url of u.lan) console.log('  ' + url);
  console.log(`\nOn this machine only (no certificate warning):\n  ${u.local}`);
  console.log('\nOther devices will warn about the self-signed certificate once; choose "Advanced -> Proceed".');
  console.log('Press Ctrl+C to stop.');
}).catch((e) => {
  console.error('Could not start: ' + e.message);
  process.exit(1);
});

process.on('SIGINT', () => { console.log('\nbye'); process.exit(0); });
process.on('SIGTERM', () => process.exit(0));
