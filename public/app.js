(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const te = new TextEncoder();
  const td = new TextDecoder();
  const desktop = window.chute || null; // present inside the desktop app
  const IS_MAC = desktop ? desktop.platform === 'darwin' : /Mac/.test(navigator.platform);

  // ---------- icons ----------
  const ICONS = {
    chute: '<path d="M12 3v11m0 0l-4-4m4 4l4-4M5 19h14"/>',
    send: '<path d="M5 12h13M13 6l6 6-6 6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    download: '<path d="M12 4v11m0 0l-4-4m4 4l4-4M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 6.2A9.5 9.5 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3 3.6M6.4 6.9A15.6 15.6 0 0 0 2.5 12S6 18 12 18a9.4 9.4 0 0 0 3.6-.7"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    expand: '<path d="M6 9l6 6 6-6"/>',
    collapse: '<path d="M6 15l6-6 6 6"/>',
    pin: '<path d="M14.5 3.5l6 6-2.6.9-2.6 2.6.5 4-2.7-2.7L7 20.5 3.5 17l6.2-6.1L7 8.2l4-.5 2.6-2.6z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M13 10l2 2"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M20 16l-4.5-4.5L7 20"/>',
    text: '<path d="M5 6h14M5 10h14M5 14h9M5 18h6"/>',
    archive: '<rect x="3.5" y="4" width="17" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
    file: '<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5"/>',
    media: '<circle cx="12" cy="12" r="8.5"/><path d="M10 9l5 3-5 3z"/>',
    inbox: '<path d="M4 13l2.5-8h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5z"/><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    power: '<path d="M12 3v9M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  };
  function svg(name, cls = '') {
    const t = document.createElement('template');
    t.innerHTML = `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
    return t.content.firstChild;
  }
  function setIcon(el, name) { el.replaceChildren(svg(name)); }

  const el = {
    insecure: $('#insecure'), gate: $('#gate'), gateForm: $('#gateForm'), pass: $('#passInput'), remember: $('#rememberBox'),
    unlockBtn: $('#unlockBtn'), gateError: $('#gateError'), gateIcon: $('#gateIcon'),
    app: $('#app'), status: $('#status'), statusText: $('#statusText'), lockBtn: $('#lockBtn'), pinBtn: $('#pinBtn'), settingsBtn: $('#settingsBtn'), stopBtn: $('#stopBtn'),
    toast: $('#toast'),
    dropzone: $('#dropzone'), dzIcon: $('#dzIcon'), chooseBtn: $('#chooseBtn'), fileInput: $('#fileInput'),
    textForm: $('#textForm'), textInput: $('#textInput'), sendBtn: $('#sendBtn'), uploads: $('#uploads'),
    items: $('#items'), empty: $('#empty'), emptyArt: $('#emptyArt'), listInfo: $('#listInfo'),
    overlay: $('#dropOverlay'), overlayIcon: $('#overlayIcon'),
  };
  setIcon(el.gateIcon, 'key'); setIcon(el.dzIcon, 'chute'); setIcon(el.sendBtn, 'send'); setIcon(el.emptyArt, 'inbox'); setIcon(el.overlayIcon, 'chute');
  setIcon(el.lockBtn, 'lock'); setIcon(el.pinBtn, 'pin'); setIcon(el.settingsBtn, 'gear'); setIcon(el.stopBtn, 'power');

  const state = {
    token: null, key: null, server: null, clockOffset: 0,
    items: [], metaCache: new Map(), expanded: new Set(), fullText: null, imageUrls: new Map(),
    pollTimer: null, tickTimer: null,
    known: null,            // ids seen at the last poll (null until first load)
    own: new Set(),         // ids uploaded from this device
    fresh: new Set(),       // ids that arrived from elsewhere and haven't been looked at yet
    animated: new Set(),    // ids already shown once (so re-renders don't replay the entrance animation)
    info: null,
    offline: false, failStreak: 0,
    staged: new Map(),      // id -> Promise<path | blobUrl> for drag-out
    textCache: new Map(),   // id -> full text
    draggingOut: null,      // { id, name, at } while an item is being dragged out of the chute
    usedBytes: 0, maxTotalBytes: 0,
  };
  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg; el.toast.hidden = false; el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.classList.remove('show'); setTimeout(() => { el.toast.hidden = true; }, 200); }, 1400);
  }

  // ---------- crypto ----------
  const hexToBytes = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
  const bytesToHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const toB64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  // Must match deriveAuthToken() in lib/setup.js exactly.
  async function deriveKeys(pass, saltHex, iterations) {
    const base = await crypto.subtle.importKey('raw', te.encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
    const master = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations }, base, 256);
    const hk = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey']);
    const auth = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: te.encode('lan-drop auth v1') }, hk, 256);
    const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: te.encode('lan-drop enc v1') }, hk,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return { token: bytesToHex(auth), key };
  }
  async function encrypt(bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, state.key, bytes);
    const out = new Uint8Array(12 + ct.byteLength); out.set(iv, 0); out.set(new Uint8Array(ct), 12);
    return out;
  }
  async function decrypt(buf) {
    const u = new Uint8Array(buf);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(0, 12) }, state.key, u.subarray(12));
  }

  // ---------- api ----------
  async function api(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    const res = await fetch(path, Object.assign({}, opts, { headers, cache: 'no-store' }));
    if (res.status === 401) { lock(state.known ? 'The host set up a new chute. Enter its passphrase.' : 'Wrong passphrase.'); throw new Error('unauthorized'); }
    if (res.status === 429) throw new Error('Too many failed attempts. Wait 10 minutes.');
    return res;
  }
  function setOffline(off) {
    if (state.offline === off) return;
    state.offline = off;
    el.status.classList.toggle('on', !off && !!state.token);
    el.status.classList.toggle('off', off);
    el.statusText.textContent = off ? 'Host offline' : (desktop ? (state.info && state.info.mode === 'host' ? 'Hosting' : 'Connected') : location.host);
    el.status.title = off ? 'Can\'t reach the host. Items shown may be stale; the app keeps trying.' : el.status.title;
    document.documentElement.classList.toggle('offline', off);
    if (desktop) desktop.connState(off ? 'offline' : 'online');
  }
  function uploadXHR(bytes, metaB64, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/items');
      xhr.setRequestHeader('Authorization', 'Bearer ' + state.token);
      xhr.setRequestHeader('X-Meta', metaB64);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        if (xhr.status === 201) return resolve(JSON.parse(xhr.responseText));
        if (xhr.status === 401) { lock('Wrong passphrase.'); return reject(new Error('unauthorized')); }
        let msg = 'upload failed (' + xhr.status + ')';
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch { /* ignore */ }
        reject(new Error(msg));
      };
      xhr.onerror = () => reject(new Error('network error'));
      xhr.send(new Blob([bytes]));
    });
  }

  // ---------- unlock / lock ----------
  async function unlock(pass, remember) {
    el.unlockBtn.disabled = true; el.unlockBtn.textContent = 'Deriving key…'; el.gateError.hidden = true;
    try {
      if (!state.server) {
        const r = await fetch('/api/salt', { cache: 'no-store' });
        if (!r.ok) throw new Error('host unreachable');
        state.server = await r.json();
      }
      const { token, key } = await deriveKeys(pass, state.server.salt, state.server.iterations);
      state.token = token; state.key = key;
      const r = await fetch('/api/items', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
      if (r.status === 401) throw new Error('Wrong passphrase.');
      if (r.status === 429) throw new Error('Too many failed attempts. Wait 10 minutes.');
      if (!r.ok) throw new Error('host error ' + r.status);
      try {
        sessionStorage.setItem('chutePass', pass);
        if (remember) localStorage.setItem('chutePass', pass); else localStorage.removeItem('chutePass');
      } catch { /* storage unavailable */ }
      showApp();
      if (desktop) desktop.serverInfo(state.server);
      await applyList(await r.json());
      startPolling();
    } catch (e) {
      state.token = null; state.key = null;
      el.gateError.textContent = e.message; el.gateError.hidden = false;
    } finally {
      el.unlockBtn.disabled = false; el.unlockBtn.textContent = 'Unlock';
    }
  }
  function lock(msg) {
    stopPolling();
    setOffline(false);
    if (desktop) desktop.connState('locked');
    state.token = null; state.key = null; state.items = []; state.metaCache.clear(); state.expanded.clear(); state.known = null; state.fresh.clear();
    for (const u of state.imageUrls.values()) URL.revokeObjectURL(u);
    state.imageUrls.clear();
    try { sessionStorage.removeItem('chutePass'); localStorage.removeItem('chutePass'); } catch { /* ignore */ }
    el.app.hidden = true; el.lockBtn.hidden = true; el.gate.hidden = false;
    el.status.classList.remove('on'); el.statusText.textContent = 'Locked';
    el.pass.value = '';
    if (msg) { el.gateError.textContent = msg; el.gateError.hidden = false; }
    el.pass.focus();
  }
  function showApp() {
    el.gate.hidden = true; el.app.hidden = false; el.lockBtn.hidden = !!desktop;
    el.status.classList.add('on');
    el.statusText.textContent = desktop ? (state.info && state.info.mode === 'host' ? 'Hosting' : 'Connected') : location.host;
    if (desktop) { desktop.connState('online'); const hosting = !!(state.info && state.info.mode === 'host'); el.stopBtn.hidden = !hosting; el.status.classList.toggle('clickable', hosting); el.status.title = hosting ? 'Click to pause hosting' : el.status.title; }
    el.status.title = `Items expire after ${state.server.ttlHours}h · max ${state.server.maxMB} MB each`;
  }

  // ---------- polling / list ----------
  function startPolling() {
    stopPolling();
    // In the desktop app the popover is usually hidden; keep polling so arrivals raise a badge/notification.
    state.pollTimer = setInterval(() => { if (desktop || !document.hidden) refresh(); }, 4000);
    state.tickTimer = setInterval(render, 30000);
    document.addEventListener('visibilitychange', onVisible);
  }
  function stopPolling() {
    clearInterval(state.pollTimer); clearInterval(state.tickTimer);
    state.pollTimer = state.tickTimer = null;
    document.removeEventListener('visibilitychange', onVisible);
  }
  function onVisible() { if (!document.hidden) refresh(); }
  async function refresh() {
    if (!state.token) return;
    try {
      const r = await api('/api/items');
      if (r.ok) { state.failStreak = 0; setOffline(false); await applyList(await r.json()); }
    } catch (e) {
      if (e && e.message === 'unauthorized') return;
      if (++state.failStreak >= 2) setOffline(true); // two missed polls (~8s) = host is gone
    }
  }

  async function applyList(data) {
    state.items = data.items;
    state.clockOffset = Date.now() - data.now;
    state.usedBytes = data.usedBytes || 0; state.maxTotalBytes = data.maxTotalBytes || 0;
    const live = new Set(state.items.map((i) => i.id));
    for (const id of [...state.metaCache.keys()]) if (!live.has(id)) state.metaCache.delete(id);
    for (const id of [...state.fresh]) if (!live.has(id)) state.fresh.delete(id);
    for (const id of [...state.animated]) if (!live.has(id)) state.animated.delete(id);
    const gone = [...state.staged.keys()].filter((id) => !live.has(id));
    for (const id of gone) { state.staged.delete(id); state.textCache.delete(id); }
    if (gone.length && desktop) desktop.unstage(gone);
    for (const [id, url] of [...state.imageUrls]) if (!live.has(id)) { URL.revokeObjectURL(url); state.imageUrls.delete(id); }
    await Promise.all(state.items.map(async (it) => {
      if (state.metaCache.has(it.id)) return;
      try { state.metaCache.set(it.id, JSON.parse(td.decode(await decrypt(fromB64(it.meta))))); }
      catch { state.metaCache.set(it.id, { kind: 'file', name: '(undecryptable item)', type: '', broken: true }); }
    }));
    noticeArrivals();
    render();
  }

  // New items from other devices: mark as fresh and (desktop) raise a notification.
  function noticeArrivals() {
    if (!state.known) { state.known = new Set(state.items.map((i) => i.id)); return; }
    const arrived = state.items.filter((i) => !state.known.has(i.id) && !state.own.has(i.id));
    for (const i of state.items) state.known.add(i.id);
    if (!arrived.length) return;
    for (const i of arrived) state.fresh.add(i.id);
    if (!desktop) return;
    const label = (it) => { const m = state.metaCache.get(it.id) || {}; return m.kind === 'text' ? (m.preview || '').replace(/\s+/g, ' ').trim().slice(0, 120) : `${m.name || 'file'} · ${fmtSize(it.size)}`; };
    if (arrived.length === 1) {
      const m = state.metaCache.get(arrived[0].id) || {};
      desktop.notify({ title: m.kind === 'text' ? 'New text in the chute' : 'New file in the chute', body: label(arrived[0]), count: state.fresh.size });
    } else {
      desktop.notify({ title: `${arrived.length} new items in the chute`, body: arrived.map((it) => { const m = state.metaCache.get(it.id) || {}; return m.kind === 'text' ? 'text' : m.name; }).join(', ').slice(0, 120), count: state.fresh.size });
    }
  }
  let seenTimer = null;
  function markSeenSoon() {
    clearTimeout(seenTimer);
    seenTimer = setTimeout(() => {
      if (document.hidden || !state.fresh.size) return;
      state.fresh.clear();
      if (desktop) desktop.clearUnread();
      render();
    }, 2500);
  }

  // ---------- formatting ----------
  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    const gb = n / 1073741824;
    return (Number.isInteger(gb) ? gb : gb.toFixed(gb < 10 ? 2 : 1)) + ' GB';
  }
  function fmtAgo(ts) {
    const s = Math.max(0, (Date.now() - state.clockOffset - ts) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function fmtLeft(ms) {
    if (ms <= 0) return 'expiring';
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'expires any moment';
    if (m < 60) return 'expires in ' + m + ' min';
    const h = Math.floor(m / 60);
    if (h < 48) return 'expires in ' + h + ' h';
    return 'expires in ' + Math.floor(h / 24) + ' d';
  }
  function kindOf(meta) {
    if (meta.kind === 'text') return 'text';
    const t = meta.type || '';
    if (t.startsWith('image/')) return 'image';
    if (t.startsWith('video/') || t.startsWith('audio/')) return 'media';
    if (/zip|tar|gzip|compressed|7z|rar/.test(t) || /\.(zip|7z|rar|gz|tgz)$/i.test(meta.name || '')) return 'archive';
    return 'file';
  }

  function h(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    for (const c of children) if (c != null) n.append(c);
    return n;
  }
  const iconBtn = (name, title, onclick, cls = '') => h('button', { class: 'icon-btn ' + cls, title, type: 'button', onclick }, svg(name));

  // ---------- render ----------
  function render() {
    el.items.replaceChildren();
    el.empty.hidden = state.items.length > 0;
    const count = state.items.length ? `${state.items.length} item${state.items.length === 1 ? '' : 's'}` : '';
    const usage = state.maxTotalBytes ? `${fmtSize(state.usedBytes)} of ${fmtSize(state.maxTotalBytes)}` : (state.items.length ? fmtSize(state.usedBytes) : '');
    el.listInfo.textContent = [count, usage].filter(Boolean).join(' · ');
    el.listInfo.classList.toggle('full', !!state.maxTotalBytes && state.usedBytes > state.maxTotalBytes * 0.9);
    const now = Date.now() - state.clockOffset;
    for (const it of state.items) {
      const meta = state.metaCache.get(it.id) || { kind: 'file', name: '…' };
      const kind = kindOf(meta);
      const isText = kind === 'text';
      const left = it.expiresAt - now;
      const expanded = state.expanded.has(it.id);
      const fresh = state.fresh.has(it.id);
      const hasMore = isText && (meta.length || 0) > (meta.preview || '').length;

      const canPeek = !isText && (canQuickLook || kind === 'image' || (meta.type || '') === 'application/pdf');
      const actions = h('div', { class: 'item-actions' });
      if (isText) {
        actions.append(iconBtn('copy', 'Copy text', (e) => copyText(it, e.currentTarget)));
        if (hasMore || expanded) actions.append(iconBtn(expanded ? 'collapse' : 'expand', expanded ? 'Show less' : 'Show all', () => toggleExpand(it.id)));
      } else {
        if (canPeek) actions.append(iconBtn(state.imageUrls.has(it.id) ? 'eyeOff' : 'eye', state.imageUrls.has(it.id) ? 'Hide preview' : (canQuickLook ? 'Quick Look' : 'Preview'), () => peek(it, meta)));
        actions.append(iconBtn('download', desktop ? 'Save to Downloads' : 'Download', () => download(it, meta)));
      }
      actions.append(iconBtn('trash', 'Delete now', () => remove(it.id), 'danger'));

      const title = isText ? ((meta.preview || '').split('\n').find((l) => l.trim()) || 'Text').trim().slice(0, 80) : meta.name;
      const name = h('div', { class: 'item-name' }, h('span', {}, title), fresh ? h('span', { class: 'new' }, 'new') : null);
      const metaLine = h('div', { class: 'item-meta' },
        `${isText ? (meta.length || 0) + ' chars' : fmtSize(it.size)} · ${fmtAgo(it.createdAt)} · `,
        h('span', { class: left < 3600000 ? 'expiring' : '' }, fmtLeft(left)));

      const enter = !state.animated.has(it.id);
      state.animated.add(it.id);
      const icon = meta.thumb
        ? h('button', { class: 'thumb-btn', type: 'button', title: canPeek ? 'Preview' : meta.name, onclick: () => { if (canPeek) peek(it, meta); } }, h('img', { class: 'thumb', src: meta.thumb, alt: '' }))
        : h('div', { class: 'tile ' + kind }, svg(kind));
      const li = h('li', { class: 'item' + (fresh ? ' fresh' : '') + (enter ? ' enter' : '') + (isText ? ' copyable' : ' draggable'), 'data-id': it.id, draggable: 'true',
        title: isText ? 'Click to copy · drag to move the text elsewhere' : 'Drag out to save it anywhere',
        onanimationend: (e) => e.currentTarget.classList.remove('enter'),
        onmousedown: (e) => { if (!e.target.closest('button')) prepareDrag(it, meta); },
        ondragstart: (e) => onDragStart(e, it, meta),
        onclick: (e) => { if (isText && !e.target.closest('button') && !e.target.closest('.item-preview.full')) copyText(it, null); },
      },
        icon,
        h('div', { class: 'item-main' }, name, metaLine),
        actions);

      if (isText) {
        const full = expanded && state.fullText && state.fullText.id === it.id ? state.fullText.text : null;
        const pre = h('div', { class: 'item-preview' + (full != null ? ' full' : (hasMore ? ' clamped' : '')) }, full != null ? full : (meta.preview || ''));
        li.append(pre);
      }
      if (kind === 'image' && state.imageUrls.has(it.id)) li.append(h('img', { class: 'item-img', src: state.imageUrls.get(it.id), alt: meta.name }));
      el.items.append(li);
    }
  }

  // ---------- item actions ----------
  async function fetchPlain(it) {
    const r = await api('/api/items/' + it.id);
    if (!r.ok) throw new Error('item is gone');
    return decrypt(await r.arrayBuffer());
  }
  async function copyText(it, btn) {
    try {
      const text = td.decode(await fetchPlain(it));
      try { await navigator.clipboard.writeText(text); }
      catch {
        const ta = h('textarea', { style: 'position:fixed;opacity:0;top:0;left:0' }, text);
        document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      if (btn) { btn.replaceChildren(svg('check')); btn.style.color = 'var(--success)'; setTimeout(() => { btn.replaceChildren(svg('copy')); btn.style.color = ''; }, 1400); }
      toast('Copied to clipboard');
    } catch (e) { alert('Could not copy: ' + e.message); }
  }

  // ---------- drag out ----------
  async function fullText(it) {
    if (state.textCache.has(it.id)) return state.textCache.get(it.id);
    const t = td.decode(await fetchPlain(it));
    state.textCache.set(it.id, t);
    return t;
  }
  // Called on mousedown so the decrypted file is ready by the time the OS drag begins.
  function prepareDrag(it, meta) {
    if (meta.kind === 'text') { fullText(it).catch(() => {}); return; }
    if (state.staged.has(it.id)) return;
    const p = (async () => {
      const buf = await fetchPlain(it);
      if (desktop && desktop.stage) return desktop.stage({ id: it.id, name: meta.name, bytes: new Uint8Array(buf) });
      return URL.createObjectURL(new Blob([buf], { type: meta.type || 'application/octet-stream' }));
    })();
    p.catch(() => state.staged.delete(it.id));
    state.staged.set(it.id, p);
  }
  function onDragStart(e, it, meta) {
    state.draggingOut = { id: it.id, name: meta.name, at: Date.now() };
    e.dataTransfer.setData('chute/internal', it.id); // lets our own drop handler ignore it
    if (meta.kind === 'text') {
      const t = state.textCache.get(it.id) || meta.preview || '';
      e.dataTransfer.setData('text/plain', t);
      e.dataTransfer.effectAllowed = 'copy';
      return;
    }
    let ready = null;
    const p = state.staged.get(it.id);
    if (p) p.then((v) => { ready = v; });
    if (desktop && desktop.startDrag) {
      e.preventDefault(); // the OS drag is started by the desktop shell with the staged file
      if (p) p.then(() => desktop.startDrag(it.id));
      return;
    }
    // browser: Chrome's DownloadURL lets you drag a file out to the desktop if the blob is ready
    if (ready && typeof ready === 'string' && ready.startsWith('blob:')) {
      e.dataTransfer.setData('DownloadURL', `${meta.type || 'application/octet-stream'}:${meta.name}:${ready}`);
    } else { e.preventDefault(); toast('Hold a moment, then drag again'); }
  }
  async function toggleExpand(id) {
    if (state.expanded.has(id)) { state.expanded.delete(id); state.fullText = null; return render(); }
    const it = state.items.find((x) => x.id === id);
    if (!it) return;
    try {
      state.fullText = { id, text: td.decode(await fetchPlain(it)) };
      state.expanded.clear(); state.expanded.add(id);
      render();
    } catch (e) { alert(e.message); }
  }
  const canQuickLook = !!(desktop && desktop.quickLook);
  async function peek(it, meta) {
    if (canQuickLook) {
      try { await desktop.quickLook({ name: meta.name, bytes: new Uint8Array(await fetchPlain(it)) }); } catch (e) { alert(e.message); }
      return;
    }
    if ((meta.type || '').startsWith('image/')) return toggleImage(it.id);
    try {
      const url = URL.createObjectURL(new Blob([await fetchPlain(it)], { type: meta.type }));
      const w = window.open(url, '_blank');
      if (!w) download(it, meta);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { alert(e.message); }
  }
  async function toggleImage(id) {
    if (state.imageUrls.has(id)) { URL.revokeObjectURL(state.imageUrls.get(id)); state.imageUrls.delete(id); return render(); }
    const it = state.items.find((x) => x.id === id);
    const meta = state.metaCache.get(id);
    try {
      state.imageUrls.set(id, URL.createObjectURL(new Blob([await fetchPlain(it)], { type: meta.type })));
      render();
    } catch (e) { alert(e.message); }
  }
  async function download(it, meta) {
    try {
      const url = URL.createObjectURL(new Blob([await fetchPlain(it)], { type: meta.type || 'application/octet-stream' }));
      const a = h('a', { href: url, download: meta.name || 'file' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { alert('Download failed: ' + e.message); }
  }
  async function remove(id) {
    const li = el.items.querySelector(`[data-id="${id}"]`);
    if (li) { li.style.transition = 'opacity .15s, transform .15s'; li.style.opacity = '0'; li.style.transform = 'scale(.98)'; }
    try { await api('/api/items/' + id, { method: 'DELETE' }); } catch { /* ignore */ }
    state.items = state.items.filter((x) => x.id !== id);
    state.fresh.delete(id);
    render();
  }

  // ---------- sending ----------
  function uploadRow(label) {
    const bar = h('div'); const barWrap = h('div', { class: 'bar' }, bar);
    const status = h('span', { class: 'muted' }, 'encrypting…');
    const row = h('div', { class: 'upload' }, h('div', { class: 'row' }, h('span', {}, label), status), barWrap);
    el.uploads.prepend(row);
    return {
      progress(p) { bar.style.width = Math.round(p * 100) + '%'; status.textContent = Math.round(p * 100) + '%'; },
      done() { row.remove(); },
      error(msg) { row.classList.add('err'); status.textContent = msg; barWrap.remove(); setTimeout(() => row.remove(), 6000); },
    };
  }
  async function sendBytes(bytes, meta, label) {
    if (bytes.byteLength > state.server.maxMB * 1024 * 1024) { uploadRow(label).error(`too large (max ${state.server.maxMB} MB)`); return; }
    const row = uploadRow(label);
    try {
      const metaB64 = toB64(await encrypt(te.encode(JSON.stringify(meta))));
      const body = await encrypt(bytes);
      const item = await uploadXHR(body, metaB64, row.progress).catch((err) => { if (/full/i.test(err.message)) toast('The chute is full'); throw err; });
      state.metaCache.set(item.id, meta);
      state.own.add(item.id);
      row.done();
      await refresh();
    } catch (e) { row.error(e.message); }
  }
  // ---------- thumbnails (made by the sender, travel encrypted inside the item's metadata) ----------
  const THUMB_PX = 144, THUMB_MAX_CHARS = 48 * 1024;
  async function imageThumb(file) {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return null;
    const scale = Math.min(1, THUMB_PX / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return c.toDataURL('image/jpeg', 0.74);
  }
  async function makeThumb(file, bytes) {
    try {
      let t = null;
      if ((file.type || '').startsWith('image/')) t = await imageThumb(file);
      if (!t && desktop && desktop.thumbnail && bytes.byteLength <= 64 * 1024 * 1024) t = await desktop.thumbnail({ name: file.name, bytes: new Uint8Array(bytes) });
      return t && t.length <= THUMB_MAX_CHARS ? t : null;
    } catch { return null; }
  }

  async function sendFile(file) {
    const name = file.name || ('clipboard-' + Date.now() + (file.type ? '.' + (file.type.split('/')[1] || 'bin').replace('jpeg', 'jpg') : ''));
    const bytes = await file.arrayBuffer();
    const meta = { kind: 'file', name, type: file.type || guessType(name) };
    const thumb = await makeThumb(file, bytes);
    if (thumb) meta.thumb = thumb;
    await sendBytes(bytes, meta, name);
  }
  function guessType(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    return { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', svg: 'image/svg+xml',
      mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', zip: 'application/zip', txt: 'text/plain', md: 'text/markdown', json: 'application/json' }[ext] || 'application/octet-stream';
  }
  async function sendText(text) {
    text = text.replace(/\r\n/g, '\n');
    if (!text.trim()) return;
    await sendBytes(te.encode(text), { kind: 'text', name: 'text.txt', type: 'text/plain', preview: text.slice(0, 400), length: text.length }, 'text · ' + text.length + ' chars');
  }
  function sendFiles(files) { for (const f of files) sendFile(f); }

  // ---------- wiring ----------
  if (!window.isSecureContext || !crypto.subtle) { el.insecure.hidden = false; el.gate.hidden = true; return; }

  el.gateForm.addEventListener('submit', (e) => { e.preventDefault(); unlock(el.pass.value, el.remember.checked); });
  el.lockBtn.addEventListener('click', () => lock());

  const chooseFiles = () => (desktop ? desktop.chooseFiles() : el.fileInput.click());
  el.chooseBtn.addEventListener('click', (e) => { e.stopPropagation(); chooseFiles(); });
  el.dropzone.addEventListener('click', chooseFiles);
  el.dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseFiles(); } });
  el.fileInput.addEventListener('change', () => { sendFiles(el.fileInput.files); el.fileInput.value = ''; });

  let dragDepth = 0;
  const setDragging = (on) => { document.body.classList.toggle('dragging', on); el.overlay.hidden = !on; };
  // A drag that started on one of our own items (DOM drag or the OS drag the desktop shell starts) must not be
  // treated as something new to send. draggingOut expires on its own since a native drag never reports "ended".
  const isOwnDrag = (e) => (e.dataTransfer && e.dataTransfer.types.includes('chute/internal')) || (state.draggingOut && Date.now() - state.draggingOut.at < 60000);
  const isExternalDrag = (e) => e.dataTransfer && [...e.dataTransfer.types].some((t) => t === 'Files' || t === 'text/plain') && !isOwnDrag(e);
  let overlayWatchdog = null;
  const armWatchdog = () => { clearTimeout(overlayWatchdog); overlayWatchdog = setTimeout(() => { dragDepth = 0; setDragging(false); }, 450); }; // dragleave is unreliable; no dragover for a while = the drag left
  document.addEventListener('dragenter', (e) => { e.preventDefault(); if (state.token && isExternalDrag(e)) { dragDepth++; setDragging(true); armWatchdog(); if (desktop) desktop.dragInWindow(true); } });
  document.addEventListener('dragover', (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = state.token && !isOwnDrag(e) ? 'copy' : 'none'; if (document.body.classList.contains('dragging')) armWatchdog(); });
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; setDragging(false); } });
  document.addEventListener('dragend', () => { state.draggingOut = null; dragDepth = 0; setDragging(false); });
  document.addEventListener('mouseup', () => { if (state.draggingOut) setTimeout(() => { state.draggingOut = null; }, 300); });
  document.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; setDragging(false); clearTimeout(overlayWatchdog);
    if (!state.token) return;
    const own = state.draggingOut;
    state.draggingOut = null;
    if (e.dataTransfer.types.includes('chute/internal')) return;
    const files = e.dataTransfer.files;
    if (own && files && files.length === 1 && files[0].name === own.name) { toast("That's already in the chute"); return; }
    if (files && files.length) return sendFiles(files);
    const text = e.dataTransfer.getData('text/plain');
    if (text) sendText(text);
  });
  document.addEventListener('paste', (e) => {
    if (!state.token) return;
    const t = e.target;
    const inField = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT');
    const files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) { e.preventDefault(); return sendFiles(files); }
    if (inField) return;
    const text = e.clipboardData.getData('text/plain');
    if (text) { e.preventDefault(); sendText(text); }
  });

  const autosize = () => { el.textInput.style.height = 'auto'; el.textInput.style.height = Math.min(el.textInput.scrollHeight, 180) + 'px'; el.sendBtn.disabled = !el.textInput.value.trim(); };
  el.textInput.addEventListener('input', autosize);
  el.textForm.addEventListener('submit', (e) => { e.preventDefault(); const v = el.textInput.value; el.textInput.value = ''; autosize(); sendText(v); });
  el.textInput.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); el.textForm.requestSubmit(); } });

  window.addEventListener('focus', markSeenSoon);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) markSeenSoon(); });

  if (desktop) {
    document.documentElement.classList.add('desktop', IS_MAC ? 'mac' : 'win');
    el.settingsBtn.hidden = false; el.pinBtn.hidden = false;
    el.stopBtn.addEventListener('click', () => desktop.stopHosting());
    el.status.addEventListener('click', () => { if (state.info && state.info.mode === 'host' && state.token) desktop.stopHosting(); });
    desktop.onLock(() => lock());
    desktop.onTrayDrag((on) => { if (state.token) setDragging(on); });
    const hint = document.getElementById('gateDesktopHint'); if (hint) hint.hidden = false;
    el.settingsBtn.addEventListener('click', () => desktop.openSettings());
    el.pinBtn.addEventListener('click', async () => { const pinned = await desktop.togglePinned(); el.pinBtn.classList.toggle('active', pinned); });
    desktop.info().then((info) => { state.info = info; el.pinBtn.classList.toggle('active', !!info.pinned); el.stopBtn.hidden = info.mode !== 'host'; if (state.token) showApp(); });
    el.remember.checked = true;
    desktop.onDropFiles((files) => { if (state.token) sendFiles(files.map((f) => new File([f.bytes], f.name, { type: f.type || '' }))); });
    desktop.onDropText((text) => { if (state.token) sendText(text); });
    desktop.onShown(() => { refresh(); markSeenSoon(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') desktop.hide(); });
  }

  (async () => {
    let saved = null;
    try { saved = localStorage.getItem('chutePass') || sessionStorage.getItem('chutePass'); } catch { /* ignore */ }
    if (!saved && desktop && desktop.takePassphrase) saved = await desktop.takePassphrase(); // just set up in Settings
    if (saved) { el.remember.checked = desktop ? true : !!localStorage.getItem('chutePass'); unlock(saved, el.remember.checked); }
    else el.pass.focus();
  })();
})();
