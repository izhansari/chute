#!/usr/bin/env node
'use strict';
/*
 * LAN Drop server.
 * Stores only ciphertext. Browsers encrypt/decrypt with a key derived from the
 * shared passphrase; the server holds just a hash of a separately derived auth token.
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'config', 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('Not set up yet. Run:  npm run setup');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
fs.mkdirSync(DATA_DIR, { recursive: true });

const PORT = Number(process.env.PORT || config.port || 8443);
const LOCAL_HTTP_PORT = PORT + 1; // loopback-only, no certificate warning on the host machine
const TTL_MS = Number(config.ttlHours || 24) * 3600 * 1000;
const MAX_BYTES = Number(config.maxMB || 512) * 1024 * 1024;
const MAX_META_B64 = 16 * 1024;
const AUTH_HASH = Buffer.from(config.authHash, 'hex');
const ALLOW_PUBLIC = process.env.DROP_ALLOW_PUBLIC === '1';

// ---------- helpers ----------
const ID_RE = /^[a-f0-9]{16}$/;
const STATIC = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'application/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
};

function send(res, status, body, headers = {}) {
  const isJson = body !== undefined && typeof body === 'object' && !Buffer.isBuffer(body);
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function normalizeIp(ip) {
  if (!ip) return '';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function isPrivateIp(ip) {
  ip = normalizeIp(ip);
  if (ip === '::1' || ip === '127.0.0.1') return true;
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / tailscale-style
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('fe80')) return true; // link-local
  return false;
}

// Brute-force protection: per-IP failure counter with lockout.
const failures = new Map();
const MAX_FAILS = 10;
const LOCK_MS = 10 * 60 * 1000;
function isLocked(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (f.until && Date.now() < f.until) return true;
  if (f.until && Date.now() >= f.until) failures.delete(ip);
  return false;
}
function noteFailure(ip) {
  const f = failures.get(ip) || { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILS) { f.until = Date.now() + LOCK_MS; f.count = 0; }
  failures.set(ip, f);
}

function checkAuth(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer ([a-f0-9]{64})$/i);
  if (!m) return false;
  const given = crypto.createHash('sha256').update(Buffer.from(m[1], 'hex')).digest();
  return given.length === AUTH_HASH.length && crypto.timingSafeEqual(given, AUTH_HASH);
}

function metaPath(id) { return path.join(DATA_DIR, id + '.json'); }
function binPath(id) { return path.join(DATA_DIR, id + '.bin'); }

function readItem(id) {
  try { return JSON.parse(fs.readFileSync(metaPath(id), 'utf8')); } catch { return null; }
}

function removeItem(id) {
  for (const p of [metaPath(id), binPath(id)]) {
    try { fs.unlinkSync(p); } catch { /* already gone */ }
  }
}

function listItems() {
  const now = Date.now();
  const items = [];
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!f.endsWith('.json')) continue;
    const id = f.slice(0, -5);
    if (!ID_RE.test(id)) continue;
    const item = readItem(id);
    if (!item) continue;
    if (item.expiresAt <= now) { removeItem(id); continue; }
    items.push(item);
  }
  items.sort((a, b) => b.createdAt - a.createdAt);
  return items;
}

function sweep() {
  try {
    listItems();
    // orphaned .bin files (crash mid-upload)
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (f.endsWith('.bin') && !fs.existsSync(metaPath(f.slice(0, -4)))) {
        const st = fs.statSync(path.join(DATA_DIR, f));
        if (Date.now() - st.mtimeMs > 60 * 60 * 1000) fs.unlinkSync(path.join(DATA_DIR, f));
      }
      if (f.endsWith('.part')) {
        const st = fs.statSync(path.join(DATA_DIR, f));
        if (Date.now() - st.mtimeMs > 6 * 60 * 60 * 1000) fs.unlinkSync(path.join(DATA_DIR, f));
      }
    }
  } catch (e) { console.error('sweep error', e.message); }
}

// ---------- request handling ----------
function handleUpload(req, res) {
  const metaB64 = req.headers['x-meta'];
  if (typeof metaB64 !== 'string' || !metaB64 || metaB64.length > MAX_META_B64 || !/^[A-Za-z0-9+/=]+$/.test(metaB64)) {
    return send(res, 400, { error: 'missing or invalid X-Meta header' });
  }
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return send(res, 413, { error: `too large (max ${config.maxMB} MB)` });
  }

  const id = crypto.randomBytes(8).toString('hex');
  const tmp = path.join(DATA_DIR, id + '.part');
  const out = fs.createWriteStream(tmp, { mode: 0o600 });
  let size = 0;
  let aborted = false;

  const fail = (status, msg) => {
    if (aborted) return;
    aborted = true;
    out.destroy();
    fs.unlink(tmp, () => {});
    if (!res.headersSent) send(res, status, { error: msg });
    req.destroy();
  };

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BYTES) return fail(413, `too large (max ${config.maxMB} MB)`);
    if (!out.write(chunk)) { req.pause(); out.once('drain', () => req.resume()); }
  });
  req.on('error', () => fail(400, 'upload interrupted'));
  req.on('aborted', () => fail(400, 'upload aborted'));
  req.on('end', () => {
    if (aborted) return;
    out.end(() => {
      if (aborted) return;
      if (size < 13) { fs.unlink(tmp, () => {}); return send(res, 400, { error: 'empty body' }); }
      const now = Date.now();
      const item = { id, size, meta: metaB64, createdAt: now, expiresAt: now + TTL_MS };
      try {
        fs.renameSync(tmp, binPath(id));
        fs.writeFileSync(metaPath(id), JSON.stringify(item), { mode: 0o600 });
      } catch (e) {
        removeItem(id);
        return send(res, 500, { error: 'could not store item' });
      }
      send(res, 201, item);
    });
  });
}

function handleDownload(req, res, id) {
  const item = readItem(id);
  if (!item || item.expiresAt <= Date.now()) { if (item) removeItem(id); return send(res, 404, { error: 'not found' }); }
  let st;
  try { st = fs.statSync(binPath(id)); } catch { removeItem(id); return send(res, 404, { error: 'not found' }); }
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(binPath(id)).on('error', () => res.destroy()).pipe(res);
}

function serveStatic(req, res, entry) {
  const p = path.join(PUBLIC_DIR, entry.file);
  fs.readFile(p, (err, data) => {
    if (err) return send(res, 404, 'not found');
    res.writeHead(200, {
      'Content-Type': entry.type,
      'Cache-Control': 'no-cache',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...(req.socket.encrypted ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
    });
    res.end(data);
  });
}

function onRequest(req, res) {
  const ip = normalizeIp(req.socket.remoteAddress);
  if (!ALLOW_PUBLIC && !isPrivateIp(ip)) return send(res, 403, 'LAN only');

  const url = new URL(req.url, 'https://localhost');
  const p = url.pathname;

  if (req.method === 'GET' && STATIC[p]) return serveStatic(req, res, STATIC[p]);

  if (p === '/api/salt' && req.method === 'GET') {
    return send(res, 200, { salt: config.salt, iterations: config.kdfIterations, ttlHours: config.ttlHours, maxMB: config.maxMB });
  }

  if (!p.startsWith('/api/')) return send(res, 404, 'not found');

  if (isLocked(ip)) return send(res, 429, { error: 'too many failed attempts, try again later' }, { 'Retry-After': '600' });
  if (!checkAuth(req)) { noteFailure(ip); return send(res, 401, { error: 'bad passphrase' }); }
  failures.delete(ip);

  if (p === '/api/items') {
    if (req.method === 'GET') return send(res, 200, { items: listItems(), now: Date.now() });
    if (req.method === 'POST') return handleUpload(req, res);
    return send(res, 405, { error: 'method not allowed' });
  }

  const m = p.match(/^\/api\/items\/([a-f0-9]{16})$/);
  if (m) {
    const id = m[1];
    if (req.method === 'GET' || req.method === 'HEAD') return handleDownload(req, res, id);
    if (req.method === 'DELETE') { removeItem(id); return send(res, 200, { ok: true }); }
    return send(res, 405, { error: 'method not allowed' });
  }

  send(res, 404, { error: 'not found' });
}

// ---------- boot ----------
const tls = {
  key: fs.readFileSync(config.keyPath),
  cert: fs.readFileSync(config.certPath),
  minVersion: 'TLSv1.2',
};
const server = https.createServer(tls, onRequest);
server.requestTimeout = 0;      // long uploads
server.headersTimeout = 60000;
server.keepAliveTimeout = 15000;

// Loopback-only plain HTTP for the machine running the server (localhost counts as a secure context).
const local = http.createServer(onRequest);
local.requestTimeout = 0;
local.headersTimeout = 60000;
local.on('error', (e) => console.error('local http listener failed:', e.message));
local.listen(LOCAL_HTTP_PORT, '127.0.0.1');

server.listen(PORT, '0.0.0.0', () => {
  sweep();
  setInterval(sweep, 60 * 1000).unref();
  const host = os.hostname().split('.')[0];
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
  }
  console.log('LAN Drop is running (end-to-end encrypted, items expire after %dh)\n', config.ttlHours);
  console.log('Open one of these on any device on the same network:');
  console.log(`  https://${host}.local:${PORT}`);
  for (const ip of ips) console.log(`  https://${ip}:${PORT}`);
  console.log(`\nOn this machine only (no certificate warning):\n  http://localhost:${LOCAL_HTTP_PORT}`);
  console.log('\nOther devices will warn about the self-signed certificate once; choose "Advanced -> Proceed".');
  console.log('Press Ctrl+C to stop.');
});

process.on('SIGINT', () => { console.log('\nbye'); process.exit(0); });
process.on('SIGTERM', () => process.exit(0));
