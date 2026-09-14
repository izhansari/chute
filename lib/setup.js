'use strict';
/*
 * Shared setup logic: key derivation (must match public/app.js), certificate
 * generation and config writing. Used by setup.js (CLI) and the desktop app.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const KDF_ITERATIONS = 250000;

function deriveAuthToken(passphrase, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  const master = crypto.pbkdf2Sync(Buffer.from(passphrase.normalize('NFKC'), 'utf8'), salt, KDF_ITERATIONS, 32, 'sha256');
  return Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), Buffer.from('lan-drop auth v1'), 32));
}

function localIPv4s() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
  }
  return out;
}

function certNames() {
  const host = os.hostname();
  const shortHost = host.split('.')[0];
  const dns = [...new Set(['localhost', host, shortHost + '.local'])];
  const ips = [...new Set(['127.0.0.1', ...localIPv4s()])];
  return { dns, ips };
}

function makeCertWithOpenssl(keyPath, certPath) {
  const { dns, ips } = certNames();
  const sans = dns.map((d) => 'DNS:' + d).concat(ips.map((ip) => 'IP:' + ip)).join(',');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
    '-keyout', keyPath, '-out', certPath, '-days', '825',
    '-pkeyopt', 'ec_param_enc:named_curve',
    '-subj', '/CN=Chute', '-addext', `subjectAltName=${sans}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
}

function makeCertWithSelfsigned(keyPath, certPath) {
  const selfsigned = require('selfsigned'); // optional dependency, present in the desktop build
  const { dns, ips } = certNames();
  const altNames = dns.map((d) => ({ type: 2, value: d })).concat(ips.map((ip) => ({ type: 7, ip })));
  const pems = selfsigned.generate([{ name: 'commonName', value: 'Chute' }], {
    keySize: 2048, days: 825, algorithm: 'sha256',
    extensions: [{ name: 'basicConstraints', cA: false }, { name: 'subjectAltName', altNames }],
  });
  fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
  fs.writeFileSync(certPath, pems.cert);
}

// The runtime that will *use* the key must be able to parse it (Electron's BoringSSL
// rejects some EC encodings that LibreSSL's openssl emits), so verify before accepting.
function verifyPems(keyPath, certPath) {
  const key = crypto.createPrivateKey(fs.readFileSync(keyPath));
  const cert = new crypto.X509Certificate(fs.readFileSync(certPath));
  if (!cert.checkPrivateKey(key)) throw new Error('certificate does not match key');
}

/** Generates key.pem/cert.pem in dir. Pure-JS generator when available (desktop app), else openssl. */
function makeCert(dir) {
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  const attempts = [
    ['selfsigned', () => makeCertWithSelfsigned(keyPath, certPath)],
    ['openssl', () => makeCertWithOpenssl(keyPath, certPath)],
  ];
  const errors = {};
  for (const [name, fn] of attempts) {
    try {
      fn();
      verifyPems(keyPath, certPath);
      try { fs.chmodSync(keyPath, 0o600); } catch { /* windows */ }
      return { keyPath, certPath, method: name };
    } catch (e) {
      errors[name] = String(e.stderr || e.message);
      for (const f of [keyPath, certPath]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
    }
  }
  const err = new Error('Could not create a TLS certificate. Install OpenSSL (macOS: brew install openssl) and try again.');
  err.cause = errors;
  throw err;
}

/**
 * Writes a complete config into dir. Never stores the passphrase.
 * opts: { passphrase, port, ttlHours, maxMB, dir }
 */
function writeConfig(opts) {
  const dir = opts.dir;
  fs.mkdirSync(dir, { recursive: true });
  if (!opts.passphrase || opts.passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
  const salt = crypto.randomBytes(16).toString('hex');
  const authHash = crypto.createHash('sha256').update(deriveAuthToken(opts.passphrase, salt)).digest('hex');
  const { keyPath, certPath } = makeCert(dir);
  const config = {
    port: Number(opts.port || 8443),
    ttlHours: Number(opts.ttlHours || 24),
    maxMB: Number(opts.maxMB || 512),
    kdfIterations: KDF_ITERATIONS,
    salt,
    authHash,
    keyPath,
    certPath,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  return config;
}

module.exports = { KDF_ITERATIONS, deriveAuthToken, makeCert, writeConfig, localIPv4s };
