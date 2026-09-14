'use strict';
/*
 * LAN Drop desktop: a menu bar / system tray app around the same web UI and server.
 *  - host mode: runs the server in-process and advertises it on the LAN (mDNS)
 *  - connect mode: opens a teammate's drop, with certificate pinning (no browser warnings)
 *  - native notifications for new items, tray drop (macOS), clipboard send, launch at login
 */
const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, ipcMain, shell, screen, dialog, clipboard, session } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLanDrop } = require('../lib/server');
const { writeConfig } = require('../lib/setup');

const SELF_TEST = process.env.LANDROP_SELFTEST || null;
if (SELF_TEST) app.setPath('userData', path.join(SELF_TEST, 'userData'));

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const ICONS = path.join(__dirname, 'icons');
const USER_DATA = app.getPath('userData');
const SETTINGS_PATH = path.join(USER_DATA, 'settings.json');
const HOST_DIR = path.join(USER_DATA, 'host');

let settings = loadSettings();
let tray = null;
let win = null;
let settingsWin = null;
let drop = null;          // running host server
let bonjour = null;
let mdnsBrowser = null;
let mdnsService = null;
let quitting = false;

// ---------- settings ----------
function loadSettings() {
  const defaults = { mode: null, serverUrl: '', launchAtLogin: false, notifications: true, pins: {} };
  try { return Object.assign(defaults, JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))); } catch { return defaults; }
}
function saveSettings() {
  fs.mkdirSync(USER_DATA, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}
function hostConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(HOST_DIR, 'config.json'), 'utf8')); } catch { return null; }
}

function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  const u = new URL(s);
  if (!u.port && u.protocol === 'https:') u.port = '8443';
  u.pathname = '/'; u.search = ''; u.hash = '';
  return u.toString();
}

function targetUrl() {
  if (settings.mode === 'host' && drop) return `http://127.0.0.1:${drop.localPort}/`;
  if (settings.mode === 'connect' && settings.serverUrl) return settings.serverUrl;
  return null;
}

// ---------- host server ----------
async function startHost() {
  await stopHost();
  const config = hostConfig();
  if (!config) throw new Error('Host is not configured yet.');
  drop = createLanDrop({ config, dataDir: path.join(HOST_DIR, 'data'), log: (m) => console.log('[server]', m) });
  await drop.start();
  advertise(config.port);
  return drop;
}
async function stopHost() {
  unadvertise();
  if (drop) { try { await drop.stop(); } catch { /* ignore */ } drop = null; }
}

function getBonjour() {
  if (bonjour) return bonjour;
  try {
    const { Bonjour } = require('bonjour-service');
    bonjour = new Bonjour(undefined, (err) => console.log('[mdns]', err && err.message));
  } catch (e) { console.log('[mdns] unavailable:', e.message); }
  return bonjour;
}
function advertise(port) {
  const b = getBonjour();
  if (!b) return;
  try {
    const host = os.hostname().split('.')[0];
    // Advertise under our own mDNS hostname. Answering for the machine's real
    // "<host>.local" name from a second responder makes macOS think the name is
    // taken and rename the computer to "<host>-2".
    mdnsService = b.publish({ name: `LAN Drop on ${host}`, type: 'lan-drop', port, host: `lan-drop-${host.toLowerCase()}.local`, txt: { v: '1', host } });
  } catch (e) { console.log('[mdns] publish failed:', e.message); }
}
function unadvertise() {
  if (mdnsService) { try { mdnsService.stop(); } catch { /* ignore */ } mdnsService = null; }
}
function startDiscovery(onFound) {
  stopDiscovery();
  const b = getBonjour();
  if (!b) return;
  try {
    mdnsBrowser = b.find({ type: 'lan-drop' }, (svc) => {
      const ip = (svc.addresses || []).find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
      if (!ip) return;
      onFound({ name: svc.name, host: (svc.txt && svc.txt.host) || svc.host, url: `https://${ip}:${svc.port}/` });
    });
  } catch (e) { console.log('[mdns] browse failed:', e.message); }
}
function stopDiscovery() {
  if (mdnsBrowser) { try { mdnsBrowser.stop(); } catch { /* ignore */ } mdnsBrowser = null; }
}

// ---------- certificate pinning (trust on first use) ----------
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  let host;
  try { host = new URL(url).host; } catch { return callback(false); }
  const fp = certificate.fingerprint;
  const pinned = settings.pins[host];
  if (pinned === fp) { event.preventDefault(); return callback(true); }
  if (!pinned) {
    settings.pins[host] = fp; saveSettings();
    event.preventDefault();
    notify('Connected to ' + host, 'Its certificate is now remembered on this device.');
    return callback(true);
  }
  callback(false);
  dialog.showMessageBox({
    type: 'warning', buttons: ['Cancel', 'Trust the new certificate'], defaultId: 0, cancelId: 0,
    title: 'Certificate changed',
    message: `The certificate for ${host} is different from the one remembered.`,
    detail: 'This happens if the host re-ran setup or reinstalled. If you did not expect this, do not continue.',
  }).then(({ response }) => {
    if (response === 1) { settings.pins[host] = fp; saveSettings(); if (win) win.loadURL(url); }
  });
});

// ---------- windows ----------
function createMainWindow() {
  win = new BrowserWindow({
    width: 460, height: 700, minWidth: 360, minHeight: 480, show: false,
    title: 'LAN Drop',
    skipTaskbar: IS_WIN, // tray app on Windows
    icon: path.join(ICONS, 'icon-256.png'),
    backgroundColor: '#0f1216',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { const t = targetUrl(); if (!t || !url.startsWith(t)) e.preventDefault(); });
  win.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: targetUrl() || '', reason: desc } });
  });
  return win;
}

function positionNearTray() {
  if (!win || !tray) return;
  try {
    const tb = tray.getBounds();
    const display = screen.getDisplayNearestPoint({ x: tb.x, y: tb.y });
    const wa = display.workArea;
    const [w, h] = win.getSize();
    let x = Math.round(tb.x + tb.width / 2 - w / 2);
    let y = IS_MAC ? Math.round(tb.y + tb.height + 6) : Math.round(tb.y - h - 6);
    if (tb.width === 0 && tb.height === 0) { x = wa.x + wa.width - w - 12; y = wa.y + wa.height - h - 12; }
    x = Math.max(wa.x, Math.min(x, wa.x + wa.width - w));
    y = Math.max(wa.y, Math.min(y, wa.y + wa.height - h));
    win.setPosition(x, y, false);
  } catch { /* keep current position */ }
}

function showMain() {
  if (!win) createMainWindow();
  const t = targetUrl();
  if (!t) return openSettings();
  const current = win.webContents.getURL();
  if (!current.startsWith(t)) win.loadURL(t);
  positionNearTray();
  win.show();
  win.focus();
}
function toggleMain() {
  if (win && win.isVisible() && win.isFocused()) win.hide(); else showMain();
}

function openSettings() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 520, height: 720, resizable: true, title: 'LAN Drop Settings', show: false,
    icon: path.join(ICONS, 'icon-256.png'),
    backgroundColor: '#0f1216',
    webPreferences: { preload: path.join(__dirname, 'settings-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.once('ready-to-show', () => { settingsWin.show(); if (IS_MAC) app.dock.show(); });
  settingsWin.on('closed', () => { settingsWin = null; stopDiscovery(); if (IS_MAC && !SELF_TEST) app.dock.hide(); });
  startDiscovery((svc) => { if (settingsWin) settingsWin.webContents.send('discovered', svc); });
}

// ---------- notifications ----------
function notify(title, body, onClick) {
  if (!settings.notifications || !Notification.isSupported()) return;
  const n = new Notification({ title: String(title).slice(0, 100), body: String(body || '').slice(0, 300), silent: false });
  n.on('click', () => { if (onClick) onClick(); else showMain(); });
  n.show();
}

// ---------- sending files/text from native surfaces ----------
const MAX_NATIVE_FILE = 512 * 1024 * 1024;
async function sendPaths(paths) {
  const files = [];
  for (const p of paths) {
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) { notify('Folders are not supported', 'Zip it first: ' + path.basename(p)); continue; }
      if (st.size > MAX_NATIVE_FILE) { notify('Too large', path.basename(p)); continue; }
      files.push({ name: path.basename(p), type: '', bytes: fs.readFileSync(p) });
    } catch (e) { notify('Could not read file', e.message); }
  }
  if (!files.length) return;
  if (!win) createMainWindow();
  if (!win.isVisible()) showMain();
  win.webContents.send('drop-files', files);
}
function sendClipboard() {
  const img = clipboard.readImage();
  if (!img.isEmpty()) {
    const name = 'clipboard-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.png';
    if (!win) createMainWindow();
    if (!win.isVisible()) showMain();
    win.webContents.send('drop-files', [{ name, type: 'image/png', bytes: img.toPNG() }]);
    return;
  }
  const text = clipboard.readText();
  if (text && text.trim()) {
    if (!win) createMainWindow();
    if (!win.isVisible()) showMain();
    win.webContents.send('drop-text', text);
    return;
  }
  notify('Clipboard is empty', 'Copy some text or an image first.');
}

// ---------- tray ----------
function trayIcon() {
  if (IS_MAC) { const i = nativeImage.createFromPath(path.join(ICONS, 'trayTemplate.png')); i.setTemplateImage(true); return i; }
  return nativeImage.createFromPath(path.join(ICONS, IS_WIN ? 'tray-16.png' : 'tray.png'));
}
function buildTrayMenu() {
  const hosting = settings.mode === 'host' && drop;
  const urls = hosting ? drop.urls() : null;
  const template = [
    { label: 'Open LAN Drop', click: showMain },
    { label: 'Send clipboard to the drop', click: sendClipboard },
    { label: 'Send files…', click: async () => {
      const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
      if (!r.canceled) sendPaths(r.filePaths);
    } },
    { type: 'separator' },
    ...(hosting ? [
      { label: 'Hosting at ' + urls.lan[0], enabled: false },
      { label: 'Copy address for teammates', click: () => { clipboard.writeText(urls.lan.join('\n')); notify('Address copied', urls.lan[0]); } },
      { type: 'separator' },
    ] : settings.mode === 'connect' ? [
      { label: 'Connected to ' + settings.serverUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''), enabled: false },
      { type: 'separator' },
    ] : []),
    { label: 'Notifications', type: 'checkbox', checked: settings.notifications, click: (mi) => { settings.notifications = mi.checked; saveSettings(); } },
    { label: 'Launch at login', type: 'checkbox', checked: settings.launchAtLogin, click: (mi) => { settings.launchAtLogin = mi.checked; saveSettings(); applyLoginItem(); } },
    { label: 'Settings…', click: openSettings },
    { type: 'separator' },
    { label: 'Quit LAN Drop', click: () => { quitting = true; app.quit(); } },
  ];
  return Menu.buildFromTemplate(template);
}
function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('LAN Drop');
  const refresh = () => tray.setContextMenu(buildTrayMenu());
  refresh();
  tray.on('click', () => { if (IS_MAC) toggleMain(); else toggleMain(); });
  tray.on('right-click', refresh);
  if (IS_MAC) {
    tray.on('drop-files', (e, files) => sendPaths(files));
    tray.on('drop-text', (e, text) => { if (!win) createMainWindow(); showMain(); win.webContents.send('drop-text', text); });
  }
  return refresh;
}
let refreshTray = () => {};

function applyLoginItem() {
  if (!app.isPackaged) return; // in dev this would register the Electron binary itself
  try {
    const current = app.getLoginItemSettings().openAtLogin;
    if (current === !!settings.launchAtLogin) return; // nothing to change
    app.setLoginItemSettings({ openAtLogin: !!settings.launchAtLogin, openAsHidden: true, args: ['--hidden'] });
  } catch (e) { console.log('[login item]', e.message); }
}

// ---------- IPC ----------
ipcMain.on('notify', (e, payload) => {
  if (!payload || typeof payload !== 'object') return;
  if (win && win.isVisible() && win.isFocused()) return; // they're looking at it
  notify(String(payload.title || 'New in the drop'), String(payload.body || ''));
});
ipcMain.on('open-settings', () => openSettings());
ipcMain.handle('app-info', () => ({ platform: process.platform, version: app.getVersion(), mode: settings.mode }));

ipcMain.handle('settings:get', () => {
  const cfg = hostConfig();
  return {
    mode: settings.mode, serverUrl: settings.serverUrl, launchAtLogin: settings.launchAtLogin, notifications: settings.notifications,
    hostConfigured: !!cfg,
    host: cfg ? { port: cfg.port, ttlHours: cfg.ttlHours, maxMB: cfg.maxMB } : { port: 8443, ttlHours: 24, maxMB: 512 },
    hostUrls: drop ? drop.urls() : null,
    hostname: os.hostname().split('.')[0],
    canLoginItem: app.isPackaged,
  };
});

ipcMain.handle('settings:save', async (e, s) => {
  try {
    settings.notifications = !!s.notifications;
    settings.launchAtLogin = !!s.launchAtLogin;
    if (s.mode === 'connect') {
      const url = normalizeUrl(s.serverUrl);
      if (!url) throw new Error('Enter the address of the drop to connect to.');
      await stopHost();
      settings.mode = 'connect'; settings.serverUrl = url;
    } else if (s.mode === 'host') {
      const existing = hostConfig();
      if (s.passphrase) {
        if (s.passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
        if (existing) { try { fs.rmSync(path.join(HOST_DIR, 'data'), { recursive: true, force: true }); } catch { /* ignore */ } }
        writeConfig({ dir: HOST_DIR, passphrase: s.passphrase, port: s.port, ttlHours: s.ttlHours, maxMB: s.maxMB });
      } else if (existing) {
        Object.assign(existing, { port: Number(s.port || existing.port), ttlHours: Number(s.ttlHours || existing.ttlHours), maxMB: Number(s.maxMB || existing.maxMB) });
        fs.writeFileSync(path.join(HOST_DIR, 'config.json'), JSON.stringify(existing, null, 2) + '\n');
      } else {
        throw new Error('Choose a passphrase to host the drop.');
      }
      settings.mode = 'host';
      await startHost();
    } else {
      throw new Error('Pick a mode.');
    }
    saveSettings();
    applyLoginItem();
    refreshTray();
    if (win) { win.loadURL(targetUrl()); }
    showMain();
    return { ok: true, hostUrls: drop ? drop.urls() : null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.on('settings:close', () => { if (settingsWin) settingsWin.close(); });
ipcMain.on('settings:open-external', (e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });

// Downloads go straight to ~/Downloads with a notification instead of a save dialog.
function wireDownloads() {
  session.defaultSession.on('will-download', (e, item) => {
    const dir = app.getPath('downloads');
    let name = item.getFilename() || 'file';
    let target = path.join(dir, name);
    let n = 1;
    while (fs.existsSync(target)) {
      const ext = path.extname(name); const base = path.basename(name, ext);
      target = path.join(dir, `${base} (${n++})${ext}`);
    }
    item.setSavePath(target);
    item.once('done', (ev, state) => {
      if (state === 'completed') notify('Saved to Downloads', path.basename(target), () => shell.showItemInFolder(target));
      else notify('Download failed', path.basename(target));
    });
  });
}

// ---------- app lifecycle ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => showMain());

app.whenReady().then(async () => {
  if (IS_MAC && !SELF_TEST) app.dock.hide();
  app.setAppUserModelId('dev.landrop.app');
  wireDownloads();
  refreshTray = createTray();
  applyLoginItem();

  if (SELF_TEST) return runSelfTest();

  if (settings.mode === 'host') {
    try { await startHost(); } catch (e) { notify('Could not start the drop', e.message); settings.mode = null; }
  }
  refreshTray();
  const hidden = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAsHidden;
  if (!settings.mode) openSettings();
  else if (!hidden) showMain();
  else createMainWindow(), win.loadURL(targetUrl()); // load in background so notifications work
});

app.on('window-all-closed', () => { /* stay in the tray */ });
app.on('before-quit', () => { quitting = true; stopHost(); if (bonjour) { try { bonjour.destroy(); } catch { /* ignore */ } } });
app.on('activate', () => showMain());

// ---------- self test (used during development): boots host mode, screenshots windows, quits ----------
async function runSelfTest() {
  const out = SELF_TEST;
  const results = {};
  try {
    writeConfig({ dir: HOST_DIR, passphrase: 'test-passphrase-123', port: 8543 });
    settings.mode = 'host'; saveSettings();
    await startHost();
    results.urls = drop.urls();
    refreshTray();

    openSettings();
    await new Promise((r) => settingsWin.webContents.once('did-finish-load', r));
    await new Promise((r) => setTimeout(r, 1500));
    fs.writeFileSync(path.join(out, 'settings.png'), (await settingsWin.webContents.capturePage()).toPNG());
    settingsWin.close();

    createMainWindow();
    win.loadURL(targetUrl());
    await new Promise((r) => win.webContents.once('did-finish-load', r));
    win.show();
    await new Promise((r) => setTimeout(r, 800));
    fs.writeFileSync(path.join(out, 'main-locked.png'), (await win.webContents.capturePage()).toPNG());
    results.desktopBridge = await win.webContents.executeJavaScript('typeof window.lanDrop === "object" && typeof window.lanDrop.notify === "function"');
    // unlock via the page's own form, then send text and a native "dropped" file
    await win.webContents.executeJavaScript(`(async () => { document.getElementById('passInput').value = 'test-passphrase-123'; document.getElementById('gateForm').requestSubmit(); await new Promise(r => setTimeout(r, 3500)); return document.getElementById('gate').hidden; })()`);
    win.webContents.send('drop-text', 'Sent from the tray menu clipboard action');
    win.webContents.send('drop-files', [{ name: 'from-tray.png', type: 'image/png', bytes: fs.readFileSync(path.join(ICONS, 'icon-256.png')) }]);
    await new Promise((r) => setTimeout(r, 3000));
    results.items = await win.webContents.executeJavaScript('[...document.querySelectorAll(".item-name")].map(e => e.textContent)');
    results.settingsButtonVisible = await win.webContents.executeJavaScript('!document.getElementById("settingsBtn").hidden');
    fs.writeFileSync(path.join(out, 'main-unlocked.png'), (await win.webContents.capturePage()).toPNG());
    results.ok = true;
  } catch (e) {
    results.ok = false; results.error = e.stack || String(e);
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  quitting = true;
  app.quit();
}
