'use strict';
/*
 * Chute desktop: a menu bar (macOS) / system tray (Windows) popover around the
 * same web UI and server.
 *  - host mode: runs the server in-process and advertises it on the LAN (mDNS)
 *  - connect mode: opens a teammate's chute, with certificate pinning (no browser warnings)
 *  - native notifications + unread badge, drop files on the menu bar icon (macOS),
 *    send clipboard from the tray menu, downloads to ~/Downloads, launch at login
 */
const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, ipcMain, shell, screen, dialog, clipboard, session, nativeTheme } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLanDrop } = require('../lib/server');
const { writeConfig } = require('../lib/setup');

const SELF_TEST = process.env.CHUTE_SELFTEST || null;
if (SELF_TEST) app.setPath('userData', path.join(SELF_TEST, 'userData'));

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const ICONS = path.join(__dirname, 'icons');
const USER_DATA = app.getPath('userData');
const SETTINGS_PATH = path.join(USER_DATA, 'settings.json');
const HOST_DIR = path.join(USER_DATA, 'host');
const POPOVER = { width: 400, height: 620 };

let settings = loadSettings();
let tray = null;
let win = null;
let settingsWin = null;
let drop = null;
let bonjour = null;
let mdnsBrowser = null;
let mdnsService = null;
let quitting = false;
let unread = 0;
let nativeDialogOpen = false;

// ---------- settings ----------
function loadSettings() {
  const defaults = { mode: null, serverUrl: '', launchAtLogin: false, notifications: true, pinned: false, pins: {} };
  try { return Object.assign(defaults, JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))); } catch { return defaults; }
}
function saveSettings() { fs.mkdirSync(USER_DATA, { recursive: true }); fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2)); }
function hostConfig() { try { return JSON.parse(fs.readFileSync(path.join(HOST_DIR, 'config.json'), 'utf8')); } catch { return null; } }
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

// ---------- host server + discovery ----------
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
  try { const { Bonjour } = require('bonjour-service'); bonjour = new Bonjour(undefined, (err) => console.log('[mdns]', err && err.message)); }
  catch (e) { console.log('[mdns] unavailable:', e.message); }
  return bonjour;
}
function advertise(port) {
  const b = getBonjour();
  if (!b) return;
  try {
    const host = os.hostname().split('.')[0];
    // Advertise under our own mDNS hostname: answering for the machine's real
    // "<host>.local" from a second responder makes macOS rename the computer.
    mdnsService = b.publish({ name: `Chute on ${host}`, type: 'chute', port, host: `chute-${host.toLowerCase()}.local`, txt: { v: '1', host } });
  } catch (e) { console.log('[mdns] publish failed:', e.message); }
}
function unadvertise() { if (mdnsService) { try { mdnsService.stop(); } catch { /* ignore */ } mdnsService = null; } }
function startDiscovery(onFound) {
  stopDiscovery();
  const b = getBonjour();
  if (!b) return;
  try {
    mdnsBrowser = b.find({ type: 'chute' }, (svc) => {
      const ip = (svc.addresses || []).find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
      if (!ip) return;
      onFound({ name: svc.name, host: (svc.txt && svc.txt.host) || svc.host, url: `https://${ip}:${svc.port}/` });
    });
  } catch (e) { console.log('[mdns] browse failed:', e.message); }
}
function stopDiscovery() { if (mdnsBrowser) { try { mdnsBrowser.stop(); } catch { /* ignore */ } mdnsBrowser = null; } }

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
    return callback(true);
  }
  callback(false);
  dialog.showMessageBox({
    type: 'warning', buttons: ['Cancel', 'Trust the new certificate'], defaultId: 0, cancelId: 0,
    title: 'Certificate changed',
    message: `The certificate for ${host} is different from the one remembered.`,
    detail: 'This happens if the host re-ran setup or reinstalled. If you did not expect this, do not continue.',
  }).then(({ response }) => { if (response === 1) { settings.pins[host] = fp; saveSettings(); if (win) win.loadURL(url); } });
});

// ---------- popover window ----------
function createMainWindow() {
  const common = {
    width: POPOVER.width, height: POPOVER.height, minWidth: 340, minHeight: 420,
    show: false, frame: false, resizable: true, fullscreenable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, alwaysOnTop: true, title: 'Chute', icon: path.join(ICONS, 'icon-256.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  };
  if (IS_MAC) Object.assign(common, { transparent: true, vibrancy: 'popover', visualEffectState: 'active', hasShadow: true, roundedCorners: true });
  else if (IS_WIN) Object.assign(common, { backgroundMaterial: 'acrylic', roundedCorners: true, backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f2f2f7' });
  else Object.assign(common, { backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f2f2f7' });

  win = new BrowserWindow(common);
  win.setMenuBarVisibility(false);
  if (IS_MAC) { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); win.setAlwaysOnTop(true, 'floating'); }
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on('blur', () => {
    // Hide like a popover, unless pinned or a native dialog of ours took focus.
    setTimeout(() => {
      if (!win || win.isDestroyed() || settings.pinned || nativeDialogOpen || quitting) return;
      if (win.isFocused()) return;
      if (settingsWin && settingsWin.isFocused()) return;
      if (IS_MAC && app.isActive && app.isActive() && BrowserWindow.getFocusedWindow()) return;
      win.hide();
    }, 120);
  });
  win.on('show', () => { clearUnread(); win.webContents.send('shown'); });
  win.on('focus', () => clearUnread());
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
    let x, y;
    if (tb.width === 0 && tb.height === 0) { x = wa.x + wa.width - w - 12; y = IS_MAC ? wa.y + 8 : wa.y + wa.height - h - 12; }
    else if (IS_MAC) { x = Math.round(tb.x + tb.width / 2 - w / 2); y = Math.round(tb.y + tb.height + 4); }
    else { x = Math.round(tb.x + tb.width / 2 - w / 2); y = Math.round(tb.y - h - 8); if (tb.y < wa.y + wa.height / 2) y = Math.round(tb.y + tb.height + 8); }
    x = Math.max(wa.x + 4, Math.min(x, wa.x + wa.width - w - 4));
    y = Math.max(wa.y + 4, Math.min(y, wa.y + wa.height - h - 4));
    win.setPosition(x, y, false);
  } catch { /* keep current position */ }
}
function ensureLoaded() {
  if (!win) createMainWindow();
  const t = targetUrl();
  if (!t) return false;
  if (!win.webContents.getURL().startsWith(t)) win.loadURL(t);
  return true;
}
function showMain() {
  if (!ensureLoaded()) return openSettings();
  positionNearTray();
  win.show();
  win.focus();
}
function toggleMain() { if (win && win.isVisible()) win.hide(); else showMain(); }

function openSettings() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 480, height: 640, resizable: false, fullscreenable: false, maximizable: false, title: 'Chute', show: false, icon: path.join(ICONS, 'icon-256.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e21' : '#f2f2f7',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    webPreferences: { preload: path.join(__dirname, 'settings-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.once('ready-to-show', () => { settingsWin.show(); if (IS_MAC) app.dock.show(); });
  settingsWin.on('closed', () => { settingsWin = null; stopDiscovery(); if (IS_MAC && !SELF_TEST) app.dock.hide(); });
  startDiscovery((svc) => { if (settingsWin) settingsWin.webContents.send('discovered', svc); });
}

// ---------- notifications + badge ----------
function notify(title, body, onClick) {
  if (!settings.notifications || !Notification.isSupported()) return;
  const n = new Notification({ title: String(title).slice(0, 100), body: String(body || '').slice(0, 300), silent: false });
  n.on('click', () => { if (onClick) onClick(); else showMain(); });
  n.show();
}
function setUnread(n) {
  unread = Math.max(0, n | 0);
  if (!tray) return;
  if (IS_MAC) tray.setTitle(unread ? String(unread) : '', { fontType: 'monospacedDigit' });
  else tray.setImage(trayIcon(unread > 0));
  tray.setToolTip(unread ? `Chute · ${unread} new` : 'Chute');
}
function clearUnread() { if (unread) setUnread(0); }

// ---------- sending from native surfaces ----------
const MAX_NATIVE_FILE = 512 * 1024 * 1024;
function pushToPage(channel, payload) {
  if (!ensureLoaded()) return openSettings();
  if (!win.isVisible()) showMain();
  win.webContents.send(channel, payload);
}
function sendPaths(paths) {
  const files = [];
  for (const p of paths) {
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) { notify('Folders are not supported', 'Zip it first: ' + path.basename(p)); continue; }
      if (st.size > MAX_NATIVE_FILE) { notify('Too large', path.basename(p)); continue; }
      files.push({ name: path.basename(p), type: '', bytes: fs.readFileSync(p) });
    } catch (e) { notify('Could not read file', e.message); }
  }
  if (files.length) pushToPage('drop-files', files);
}
function sendClipboard() {
  const img = clipboard.readImage();
  if (!img.isEmpty()) {
    const name = 'clipboard-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.png';
    return pushToPage('drop-files', [{ name, type: 'image/png', bytes: img.toPNG() }]);
  }
  const text = clipboard.readText();
  if (text && text.trim()) return pushToPage('drop-text', text);
  notify('Clipboard is empty', 'Copy some text or an image first.');
}
async function chooseFilesDialog() {
  nativeDialogOpen = true;
  try {
    const r = await dialog.showOpenDialog(win || undefined, { properties: ['openFile', 'multiSelections'] });
    if (!r.canceled) sendPaths(r.filePaths);
  } finally { nativeDialogOpen = false; if (win && !settings.pinned) win.focus(); }
}

// ---------- tray ----------
function trayIcon(badge = false) {
  if (IS_MAC) { const i = nativeImage.createFromPath(path.join(ICONS, 'trayTemplate.png')); i.setTemplateImage(true); return i; }
  return nativeImage.createFromPath(path.join(ICONS, badge ? 'tray-badge-16.png' : 'tray-16.png'));
}
function buildTrayMenu() {
  const hosting = settings.mode === 'host' && drop;
  const urls = hosting ? drop.urls() : null;
  return Menu.buildFromTemplate([
    { label: 'Open Chute', click: showMain },
    { label: 'Send clipboard', click: sendClipboard },
    { label: 'Send files…', click: chooseFilesDialog },
    { type: 'separator' },
    ...(hosting ? [
      { label: 'Hosting at ' + urls.lan[0], enabled: false },
      { label: 'Copy address for teammates', click: () => { clipboard.writeText(urls.lan.join('\n')); notify('Address copied', urls.lan[0]); } },
      { type: 'separator' },
    ] : settings.mode === 'connect' ? [
      { label: 'Connected to ' + settings.serverUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''), enabled: false },
      { type: 'separator' },
    ] : []),
    { label: 'Keep window open', type: 'checkbox', checked: settings.pinned, click: (mi) => { settings.pinned = mi.checked; saveSettings(); if (win) win.webContents.send('pinned', settings.pinned); } },
    { label: 'Notifications', type: 'checkbox', checked: settings.notifications, click: (mi) => { settings.notifications = mi.checked; saveSettings(); } },
    { label: 'Launch at login', type: 'checkbox', checked: settings.launchAtLogin, click: (mi) => { settings.launchAtLogin = mi.checked; saveSettings(); applyLoginItem(); } },
    { label: 'Settings…', click: openSettings },
    { type: 'separator' },
    { label: 'Quit Chute', click: () => { quitting = true; app.quit(); } },
  ]);
}
function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Chute');
  tray.on('click', toggleMain);
  tray.on('right-click', () => tray.popUpContextMenu(buildTrayMenu()));
  if (IS_MAC) {
    tray.on('drop-files', (e, files) => sendPaths(files));
    tray.on('drop-text', (e, text) => pushToPage('drop-text', text));
  }
  if (!IS_MAC) tray.setContextMenu(buildTrayMenu());
  return () => { if (!IS_MAC) tray.setContextMenu(buildTrayMenu()); };
}
let refreshTray = () => {};

function applyLoginItem() {
  if (!app.isPackaged) return; // in dev this would register the Electron binary itself
  try {
    if (app.getLoginItemSettings().openAtLogin === !!settings.launchAtLogin) return;
    app.setLoginItemSettings({ openAtLogin: !!settings.launchAtLogin, openAsHidden: true, args: ['--hidden'] });
  } catch (e) { console.log('[login item]', e.message); }
}

// ---------- IPC (page bridge) ----------
ipcMain.on('notify', (e, payload) => {
  if (!payload || typeof payload !== 'object') return;
  if (win && win.isVisible() && win.isFocused()) return;
  setUnread(Number(payload.count) || unread + 1);
  notify(String(payload.title || 'New in the chute'), String(payload.body || ''));
});
ipcMain.on('clear-unread', () => clearUnread());
ipcMain.on('open-settings', () => openSettings());
ipcMain.on('hide', () => { if (win && !settings.pinned) win.hide(); });
ipcMain.on('choose-files', () => chooseFilesDialog());
ipcMain.handle('toggle-pinned', () => { settings.pinned = !settings.pinned; saveSettings(); return settings.pinned; });
ipcMain.handle('app-info', () => ({ platform: process.platform, version: app.getVersion(), mode: settings.mode, pinned: settings.pinned }));

// ---------- IPC (settings window) ----------
ipcMain.handle('settings:get', () => {
  const cfg = hostConfig();
  return {
    mode: settings.mode, serverUrl: settings.serverUrl, launchAtLogin: settings.launchAtLogin, notifications: settings.notifications,
    hostConfigured: !!cfg,
    host: cfg ? { port: cfg.port, ttlHours: cfg.ttlHours, maxMB: cfg.maxMB } : { port: 8443, ttlHours: 24, maxMB: 512 },
    hostUrls: drop ? drop.urls() : null, hostname: os.hostname().split('.')[0], canLoginItem: app.isPackaged,
  };
});
ipcMain.handle('settings:save', async (e, s) => {
  try {
    settings.notifications = !!s.notifications;
    settings.launchAtLogin = !!s.launchAtLogin;
    if (s.mode === 'connect') {
      const url = normalizeUrl(s.serverUrl);
      if (!url) throw new Error('Enter the address of the chute to connect to.');
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
      } else throw new Error('Choose a passphrase to host the chute.');
      settings.mode = 'host';
      await startHost();
    } else throw new Error('Pick a mode.');
    saveSettings();
    applyLoginItem();
    refreshTray();
    if (win) win.loadURL(targetUrl());
    showMain();
    return { ok: true, hostUrls: drop ? drop.urls() : null };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.on('settings:close', () => { if (settingsWin) settingsWin.close(); });
ipcMain.on('settings:open-external', (e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('settings:copy', (e, text) => { clipboard.writeText(String(text).slice(0, 4096)); return true; });
ipcMain.on('settings:resize', (e, h) => {
  if (!settingsWin || !Number.isFinite(h)) return;
  const wa = screen.getDisplayMatching(settingsWin.getBounds()).workArea;
  const [w] = settingsWin.getContentSize();
  settingsWin.setContentSize(w, Math.max(420, Math.min(Math.round(h), wa.height - 60)), true);
});

// Downloads go straight to ~/Downloads with a notification instead of a save dialog.
function wireDownloads() {
  session.defaultSession.on('will-download', (e, item) => {
    const dir = app.getPath('downloads');
    const name = item.getFilename() || 'file';
    let target = path.join(dir, name);
    let n = 1;
    while (fs.existsSync(target)) { const ext = path.extname(name); target = path.join(dir, `${path.basename(name, ext)} (${n++})${ext}`); }
    item.setSavePath(target);
    item.once('done', (ev, s) => {
      if (s === 'completed') notify('Saved to Downloads', path.basename(target), () => shell.showItemInFolder(target));
      else notify('Download failed', path.basename(target));
    });
  });
}

// ---------- lifecycle ----------
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showMain());

app.whenReady().then(async () => {
  if (IS_MAC && !SELF_TEST) app.dock.hide();
  app.setAppUserModelId('app.chute.desktop');
  wireDownloads();
  refreshTray = createTray();
  applyLoginItem();
  if (SELF_TEST) return runSelfTest();

  if (settings.mode === 'host') {
    try { await startHost(); } catch (e) { notify('Could not start the chute', e.message); settings.mode = null; }
  }
  refreshTray();
  const hidden = process.argv.includes('--hidden') || (app.getLoginItemSettings().wasOpenedAsHidden);
  if (!settings.mode) openSettings();
  else if (!hidden) showMain();
  else ensureLoaded(); // load in the background so notifications work
});
app.on('window-all-closed', () => { /* stay in the tray */ });
app.on('before-quit', () => { quitting = true; stopHost(); if (bonjour) { try { bonjour.destroy(); } catch { /* ignore */ } } });
app.on('activate', () => showMain());

// ---------- self test (development): host mode, screenshots, native drops, quits ----------
async function runSelfTest() {
  const out = SELF_TEST;
  const results = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    writeConfig({ dir: HOST_DIR, passphrase: 'test-passphrase-123', port: 8543 });
    settings.mode = 'host'; settings.pinned = true; saveSettings();
    await startHost();
    results.urls = drop.urls();
    refreshTray();

    openSettings();
    await new Promise((r) => settingsWin.webContents.once('did-finish-load', r));
    await wait(1500);
    fs.writeFileSync(path.join(out, 'settings-host.png'), (await settingsWin.webContents.capturePage()).toPNG());
    await settingsWin.webContents.executeJavaScript('document.getElementById("segConnect").click(); true');
    await wait(700);
    fs.writeFileSync(path.join(out, 'settings-join.png'), (await settingsWin.webContents.capturePage()).toPNG());
    settingsWin.close();

    createMainWindow();
    win.loadURL(targetUrl());
    await new Promise((r) => win.webContents.once('did-finish-load', r));
    positionNearTray(); win.show();
    await wait(800);
    fs.writeFileSync(path.join(out, 'main-locked.png'), (await win.webContents.capturePage()).toPNG());
    results.bridge = await win.webContents.executeJavaScript('typeof window.chute === "object" && typeof window.chute.notify === "function"');
    await win.webContents.executeJavaScript(`(async () => { document.getElementById('passInput').value = 'test-passphrase-123'; document.getElementById('gateForm').requestSubmit(); await new Promise(r => setTimeout(r, 3500)); return document.getElementById('gate').hidden; })()`);
    win.webContents.send('drop-text', 'Standup moved to 3pm, room B.\nBring the USB-C adapter.');
    win.webContents.send('drop-files', [{ name: 'app-icon.png', type: 'image/png', bytes: fs.readFileSync(path.join(ICONS, 'icon-256.png')) }, { name: 'design-assets.zip', type: 'application/zip', bytes: Buffer.alloc(2 * 1024 * 1024) }]);
    await wait(3000);
    results.items = await win.webContents.executeJavaScript('[...document.querySelectorAll(".item-name > span:first-child")].map(e => e.textContent)');
    results.tiles = await win.webContents.executeJavaScript('[...document.querySelectorAll(".tile")].map(e => e.className)');
    fs.writeFileSync(path.join(out, 'main-unlocked.png'), (await win.webContents.capturePage()).toPNG());

    // Simulate an arrival from another device while the popover is hidden:
    // encrypt in Node with the same derivation the browser uses and POST it.
    win.hide();
    await wait(300);
    results.badgeBefore = unread;
    const crypto = require('crypto');
    const cfg = hostConfig();
    const master = crypto.pbkdf2Sync(Buffer.from('test-passphrase-123'.normalize('NFKC')), Buffer.from(cfg.salt, 'hex'), cfg.kdfIterations, 32, 'sha256');
    const authToken = Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), Buffer.from('lan-drop auth v1'), 32)).toString('hex');
    const encKey = Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), Buffer.from('lan-drop enc v1'), 32));
    const seal = (buf) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', encKey, iv); const ct = Buffer.concat([c.update(buf), c.final()]); return Buffer.concat([iv, ct, c.getAuthTag()]); };
    const text = 'Hey, can someone send me the deck from this morning?';
    const meta = seal(Buffer.from(JSON.stringify({ kind: 'text', name: 'text.txt', type: 'text/plain', preview: text, length: text.length }))).toString('base64');
    const r = await fetch(`http://127.0.0.1:${drop.localPort}/api/items`, { method: 'POST', headers: { Authorization: 'Bearer ' + authToken, 'X-Meta': meta, 'Content-Type': 'application/octet-stream' }, body: seal(Buffer.from(text)) });
    results.remoteUploadStatus = r.status;
    await wait(6000); // page polls every 4s
    results.badgeAfter = unread;
    results.trayTitle = IS_MAC ? tray.getTitle() : null;
    results.freshCount = await win.webContents.executeJavaScript('document.querySelectorAll(".item.fresh").length');
    positionNearTray(); win.show();
    await wait(600);
    fs.writeFileSync(path.join(out, 'main-fresh.png'), (await win.webContents.capturePage()).toPNG());
    if (IS_MAC) { // real composited capture (vibrancy included); needs Screen Recording permission, harmless if denied
      try {
        const b = win.getBounds();
        require('child_process').execFileSync('screencapture', ['-x', '-R', `${b.x - 8},${b.y - 8},${b.width + 16},${b.height + 16}`, path.join(out, 'main-real.png')], { timeout: 8000 });
      } catch (e) { results.screencapture = e.message; }
    }
    await wait(3000); // fresh state clears ~2.5s after the window is shown
    results.badgeAfterShown = unread;
    results.freshAfterShown = await win.webContents.executeJavaScript('document.querySelectorAll(".item.fresh").length');
    results.ok = true;
  } catch (e) { results.ok = false; results.error = e.stack || String(e); }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  quitting = true;
  app.quit();
}
