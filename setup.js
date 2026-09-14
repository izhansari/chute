#!/usr/bin/env node
'use strict';
/*
 * One-time CLI setup for LAN Drop.
 *   - asks for a shared passphrase (never stored; only a hash of a derived token is kept)
 *   - generates a self-signed TLS certificate
 *   - writes config/config.json
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { writeConfig } = require('./lib/setup');

const CONFIG_DIR = path.join(__dirname, 'config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const origWrite = rl._writeToOutput;
    rl.question(question, (answer) => {
      rl._writeToOutput = origWrite;
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
    rl._writeToOutput = function (s) {
      if (s.includes(question)) origWrite.call(rl, question);
      else origWrite.call(rl, '');
    };
  });
}

async function main() {
  let existing = null;
  if (fs.existsSync(CONFIG_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { existing = null; }
  }
  let pass = arg('pass', process.env.DROP_PASS || '');
  if (!pass) {
    console.log('Chute setup\n');
    console.log('Pick a shared passphrase. Everyone on your team types this once in their browser.');
    console.log('It is never stored anywhere and never sent to the server.\n');
    pass = await promptHidden('Passphrase: ');
    const again = await promptHidden('Again:      ');
    if (pass !== again) { console.error('Passphrases did not match.'); process.exit(1); }
  }
  const config = writeConfig({
    dir: CONFIG_DIR,
    passphrase: pass,
    port: arg('port', (existing && existing.port) || 8443),
    ttlHours: arg('ttl', (existing && existing.ttlHours) || 24),
    maxMB: arg('max', (existing && existing.maxMB) || 512),
  });
  console.log('\nDone. Config written to config/config.json');
  console.log(`  items expire after ${config.ttlHours}h, max upload ${config.maxMB} MB, port ${config.port}`);
  console.log('\nStart the server with:  npm start');
}

main().catch((e) => { console.error(e.message); if (e.cause) console.error(e.cause); process.exit(1); });
