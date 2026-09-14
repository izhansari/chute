#!/usr/bin/env node
'use strict';
/*
 * One-time setup for LAN Drop.
 *   - asks for a shared passphrase (never stored; only a hash of a derived token is kept)
 *   - generates a self-signed TLS certificate with openssl
 *   - writes config/config.json
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const CONFIG_DIR = path.join(ROOT, 'config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const KDF_ITERATIONS = 250000;

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

// Must match deriveKeys() in public/app.js exactly.
function deriveAuthToken(passphrase, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  const master = crypto.pbkdf2Sync(Buffer.from(passphrase.normalize('NFKC'), 'utf8'), salt, KDF_ITERATIONS, 32, 'sha256');
  return Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), Buffer.from('lan-drop auth v1'), 32));
}

function localIPv4s() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

function makeCert() {
  const keyPath = path.join(CONFIG_DIR, 'key.pem');
  const certPath = path.join(CONFIG_DIR, 'cert.pem');
  const host = os.hostname();
  const shortHost = host.split('.')[0];
  const sans = ['DNS:localhost', 'IP:127.0.0.1', `DNS:${host}`, `DNS:${shortHost}.local`]
    .concat(localIPv4s().map((ip) => `IP:${ip}`));
  const uniq = [...new Set(sans)].join(',');
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
      '-keyout', keyPath, '-out', certPath, '-days', '825',
      '-subj', '/CN=LAN Drop', '-addext', `subjectAltName=${uniq}`,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    console.error('\nCould not run openssl to create a TLS certificate.');
    console.error('Install OpenSSL (macOS: brew install openssl; Windows: winget install ShiningLight.OpenSSL) and re-run setup.');
    console.error(String(e.stderr || e.message));
    process.exit(1);
  }
  fs.chmodSync(keyPath, 0o600);
  return { keyPath, certPath };
}

async function main() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  let existing = null;
  if (fs.existsSync(CONFIG_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { existing = null; }
  }

  let pass = arg('pass', process.env.DROP_PASS || '');
  if (!pass) {
    console.log('LAN Drop setup\n');
    console.log('Pick a shared passphrase. Everyone on your team types this once in their browser.');
    console.log('It is never stored anywhere and never sent to the server.\n');
    pass = await promptHidden('Passphrase: ');
    const again = await promptHidden('Again:      ');
    if (pass !== again) { console.error('Passphrases did not match.'); process.exit(1); }
  }
  if (pass.length < 8) { console.error('Use at least 8 characters.'); process.exit(1); }

  const salt = crypto.randomBytes(16).toString('hex');
  const authToken = deriveAuthToken(pass, salt);
  const authHash = crypto.createHash('sha256').update(authToken).digest('hex');

  const { keyPath, certPath } = makeCert();

  const config = {
    port: Number(arg('port', (existing && existing.port) || 8443)),
    ttlHours: Number(arg('ttl', (existing && existing.ttlHours) || 24)),
    maxMB: Number(arg('max', (existing && existing.maxMB) || 512)),
    kdfIterations: KDF_ITERATIONS,
    salt,
    authHash,
    keyPath,
    certPath,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });

  console.log('\nDone. Config written to config/config.json');
  console.log(`  items expire after ${config.ttlHours}h, max upload ${config.maxMB} MB, port ${config.port}`);
  console.log('\nStart the server with:  npm start');
}

main().catch((e) => { console.error(e); process.exit(1); });
