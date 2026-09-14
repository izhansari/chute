(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const te = new TextEncoder();
  const td = new TextDecoder();

  const el = {
    insecure: $('#insecure'), gate: $('#gate'), gateForm: $('#gateForm'), pass: $('#passInput'),
    remember: $('#rememberBox'), unlockBtn: $('#unlockBtn'), gateError: $('#gateError'),
    app: $('#app'), topActions: $('#topActions'), statusPill: $('#statusPill'), lockBtn: $('#lockBtn'),
    dropzone: $('#dropzone'), chooseBtn: $('#chooseBtn'), fileInput: $('#fileInput'),
    textForm: $('#textForm'), textInput: $('#textInput'), uploads: $('#uploads'),
    items: $('#items'), empty: $('#empty'), listInfo: $('#listInfo'), subline: $('#subline'),
  };

  const state = {
    token: null, key: null, server: null,
    items: [], metaCache: new Map(), expanded: new Set(), imageUrls: new Map(),
    pollTimer: null,
  };

  // ---------- crypto ----------
  const hexToBytes = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
  const bytesToHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const toB64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  // Must match deriveAuthToken() in setup.js exactly.
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
    const out = new Uint8Array(12 + ct.byteLength);
    out.set(iv, 0); out.set(new Uint8Array(ct), 12);
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
    if (res.status === 401) { lock('Wrong passphrase.'); throw new Error('unauthorized'); }
    if (res.status === 429) { throw new Error('Too many failed attempts. Wait 10 minutes.'); }
    return res;
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
        if (!r.ok) throw new Error('server unreachable');
        state.server = await r.json();
      }
      const { token, key } = await deriveKeys(pass, state.server.salt, state.server.iterations);
      state.token = token; state.key = key;
      const r = await fetch('/api/items', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
      if (r.status === 401) throw new Error('Wrong passphrase.');
      if (r.status === 429) throw new Error('Too many failed attempts. Wait 10 minutes.');
      if (!r.ok) throw new Error('server error ' + r.status);
      try {
        sessionStorage.setItem('lanDropPass', pass);
        if (remember) localStorage.setItem('lanDropPass', pass); else localStorage.removeItem('lanDropPass');
      } catch { /* storage may be unavailable */ }
      showApp();
      const data = await r.json();
      applyList(data);
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
    state.token = null; state.key = null; state.items = []; state.metaCache.clear(); state.expanded.clear();
    for (const u of state.imageUrls.values()) URL.revokeObjectURL(u);
    state.imageUrls.clear();
    try { sessionStorage.removeItem('lanDropPass'); localStorage.removeItem('lanDropPass'); } catch { /* ignore */ }
    el.app.hidden = true; el.topActions.hidden = true; el.gate.hidden = false;
    el.pass.value = '';
    if (msg) { el.gateError.textContent = msg; el.gateError.hidden = false; }
    el.pass.focus();
  }

  function showApp() {
    el.gate.hidden = true; el.app.hidden = false; el.topActions.hidden = false;
    el.statusPill.textContent = 'unlocked · ' + location.host;
    el.subline.textContent = `End-to-end encrypted. Items disappear after ${state.server.ttlHours}h. Max ${state.server.maxMB} MB per item.`;
  }

  // ---------- list ----------
  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(() => { if (!document.hidden) refresh(); }, 4000);
    document.addEventListener('visibilitychange', onVisible);
  }
  function stopPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = null;
    document.removeEventListener('visibilitychange', onVisible);
  }
  function onVisible() { if (!document.hidden) refresh(); }

  async function refresh() {
    if (!state.token) return;
    try {
      const r = await api('/api/items');
      if (!r.ok) return;
      applyList(await r.json());
    } catch { /* offline; try again next tick */ }
  }

  async function applyList(data) {
    state.items = data.items;
    state.clockOffset = Date.now() - data.now;
    const live = new Set(state.items.map((i) => i.id));
    for (const id of [...state.metaCache.keys()]) if (!live.has(id)) state.metaCache.delete(id);
    for (const [id, url] of [...state.imageUrls]) if (!live.has(id)) { URL.revokeObjectURL(url); state.imageUrls.delete(id); }
    await Promise.all(state.items.map(async (it) => {
      if (state.metaCache.has(it.id)) return;
      try {
        const pt = await decrypt(fromB64(it.meta));
        state.metaCache.set(it.id, JSON.parse(td.decode(pt)));
      } catch {
        state.metaCache.set(it.id, { kind: 'file', name: '(undecryptable item)', type: '', broken: true });
      }
    }));
    render();
  }

  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }
  function fmtLeft(ms) {
    if (ms <= 0) return 'expiring';
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'less than a minute left';
    if (m < 60) return m + 'm left';
    const h = Math.floor(m / 60);
    if (h < 48) return h + 'h ' + (m % 60) + 'm left';
    return Math.floor(h / 24) + 'd left';
  }
  function iconFor(meta) {
    if (meta.kind === 'text') return '📝';
    const t = meta.type || '';
    if (t.startsWith('image/')) return '🖼️';
    if (t.startsWith('video/')) return '🎬';
    if (t.startsWith('audio/')) return '🎵';
    if (t.includes('pdf')) return '📄';
    if (/zip|tar|gzip|compressed|7z|rar/.test(t)) return '🗜️';
    return '📎';
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

  function render() {
    el.items.replaceChildren();
    el.empty.hidden = state.items.length > 0;
    el.listInfo.textContent = state.items.length ? `${state.items.length} item${state.items.length === 1 ? '' : 's'}` : '';
    const now = Date.now() - (state.clockOffset || 0);
    for (const it of state.items) {
      const meta = state.metaCache.get(it.id) || { kind: 'file', name: '…' };
      const left = it.expiresAt - now;
      const isText = meta.kind === 'text';
      const isImage = !isText && (meta.type || '').startsWith('image/');
      const expanded = state.expanded.has(it.id);

      const actions = h('div', { class: 'item-actions' });
      if (isText) {
        actions.append(h('button', { class: 'btn small', onclick: () => copyText(it, meta) }, 'Copy'));
        if ((meta.length || 0) > (meta.preview || '').length || expanded) {
          actions.append(h('button', { class: 'btn small ghost', onclick: () => toggleExpand(it.id) }, expanded ? 'Less' : 'Show all'));
        }
      } else {
        if (isImage) actions.append(h('button', { class: 'btn small ghost', onclick: () => toggleImage(it.id) }, state.imageUrls.has(it.id) ? 'Hide' : 'Preview'));
        actions.append(h('button', { class: 'btn small', onclick: () => download(it, meta) }, 'Download'));
      }
      actions.append(h('button', { class: 'btn small ghost danger', title: 'Delete now', onclick: () => remove(it.id) }, '✕'));

      const li = h('li', { class: 'item', 'data-id': it.id },
        h('div', { class: 'item-row' },
          h('div', { class: 'item-icon' }, iconFor(meta)),
          h('div', { class: 'item-main' },
            h('div', { class: 'item-name' }, isText ? 'Text' : meta.name),
            h('div', { class: 'item-meta' },
              `${isText ? (meta.length || 0) + ' chars' : fmtSize(it.size)} · ${new Date(it.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · `,
              h('span', { class: left < 3600000 ? 'expiring' : '' }, fmtLeft(left)))),
          actions));

      if (isText) {
        const full = expanded && state.fullText && state.fullText.id === it.id ? state.fullText.text : null;
        const pre = h('div', { class: 'item-preview' + (full ? ' full' : ((meta.length || 0) > (meta.preview || '').length ? ' clamped' : '')) }, full != null ? full : (meta.preview || ''));
        li.append(pre);
      }
      if (isImage && state.imageUrls.has(it.id)) {
        li.append(h('img', { class: 'item-img', src: state.imageUrls.get(it.id), alt: meta.name }));
      }
      el.items.append(li);
    }
  }

  // ---------- item actions ----------
  async function fetchPlain(it) {
    const r = await api('/api/items/' + it.id);
    if (!r.ok) throw new Error('item is gone');
    return decrypt(await r.arrayBuffer());
  }

  async function copyText(it, meta) {
    try {
      const text = td.decode(await fetchPlain(it));
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Fallback for browsers without the async clipboard API
        const ta = h('textarea', { style: 'position:fixed;opacity:0;top:0;left:0' }, text);
        document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      flash(it.id, 'Copied');
    } catch (e) { alert('Could not copy: ' + e.message); }
  }

  async function toggleExpand(id) {
    if (state.expanded.has(id)) { state.expanded.delete(id); state.fullText = null; return render(); }
    const it = state.items.find((x) => x.id === id);
    if (!it) return;
    try {
      const text = td.decode(await fetchPlain(it));
      state.fullText = { id, text };
      state.expanded.clear(); state.expanded.add(id);
      render();
    } catch (e) { alert(e.message); }
  }

  async function toggleImage(id) {
    if (state.imageUrls.has(id)) { URL.revokeObjectURL(state.imageUrls.get(id)); state.imageUrls.delete(id); return render(); }
    const it = state.items.find((x) => x.id === id);
    const meta = state.metaCache.get(id);
    try {
      const buf = await fetchPlain(it);
      state.imageUrls.set(id, URL.createObjectURL(new Blob([buf], { type: meta.type })));
      render();
    } catch (e) { alert(e.message); }
  }

  async function download(it, meta) {
    try {
      const buf = await fetchPlain(it);
      const url = URL.createObjectURL(new Blob([buf], { type: meta.type || 'application/octet-stream' }));
      const a = h('a', { href: url, download: meta.name || 'file' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { alert('Download failed: ' + e.message); }
  }

  async function remove(id) {
    try { await api('/api/items/' + id, { method: 'DELETE' }); } catch { /* ignore */ }
    state.items = state.items.filter((x) => x.id !== id);
    render();
  }

  function flash(id, text) {
    const li = el.items.querySelector(`[data-id="${id}"] .item-name`);
    if (!li) return;
    const old = li.textContent; li.textContent = text;
    setTimeout(() => { li.textContent = old; }, 1200);
  }

  // ---------- sending ----------
  function uploadRow(label) {
    const bar = h('div'); const barWrap = h('div', { class: 'bar' }, bar);
    const status = h('span', { class: 'muted' }, 'encrypting…');
    const row = h('div', { class: 'upload' }, h('div', {}, label, ' ', status), barWrap);
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
      const item = await uploadXHR(body, metaB64, row.progress);
      state.metaCache.set(item.id, meta);
      row.done();
      await refresh();
    } catch (e) { row.error(e.message); }
  }

  async function sendFile(file) {
    const name = file.name || ('clipboard-' + Date.now() + (file.type ? '.' + (file.type.split('/')[1] || 'bin').replace('jpeg', 'jpg') : ''));
    const bytes = await file.arrayBuffer();
    await sendBytes(bytes, { kind: 'file', name, type: file.type || 'application/octet-stream' }, name);
  }

  async function sendText(text) {
    text = text.replace(/\r\n/g, '\n');
    if (!text.trim()) return;
    const bytes = te.encode(text);
    await sendBytes(bytes, { kind: 'text', name: 'text.txt', type: 'text/plain', preview: text.slice(0, 400), length: text.length }, 'text (' + text.length + ' chars)');
  }

  function sendFiles(files) { for (const f of files) sendFile(f); }

  // ---------- wiring ----------
  if (!window.isSecureContext || !crypto.subtle) {
    el.insecure.hidden = false; el.gate.hidden = true;
    return;
  }

  el.gateForm.addEventListener('submit', (e) => { e.preventDefault(); unlock(el.pass.value, el.remember.checked); });
  el.lockBtn.addEventListener('click', () => lock());

  el.chooseBtn.addEventListener('click', (e) => { e.stopPropagation(); el.fileInput.click(); });
  el.dropzone.addEventListener('click', () => el.fileInput.click());
  el.dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.fileInput.click(); } });
  el.fileInput.addEventListener('change', () => { sendFiles(el.fileInput.files); el.fileInput.value = ''; });

  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => { e.preventDefault(); if (state.token) { dragDepth++; document.body.classList.add('dragging'); } });
  document.addEventListener('dragover', (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = state.token ? 'copy' : 'none'; });
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
  document.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
    if (!state.token) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length) return sendFiles(e.dataTransfer.files);
    const text = e.dataTransfer.getData('text/plain');
    if (text) sendText(text);
  });

  document.addEventListener('paste', (e) => {
    if (!state.token) return;
    const t = e.target;
    const inField = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT');
    const files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) { e.preventDefault(); return sendFiles(files); }
    if (inField) return; // let them paste into the text box and press Send
    const text = e.clipboardData.getData('text/plain');
    if (text) { e.preventDefault(); sendText(text); }
  });

  el.textForm.addEventListener('submit', (e) => { e.preventDefault(); const v = el.textInput.value; el.textInput.value = ''; sendText(v); });
  el.textInput.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); el.textForm.requestSubmit(); } });

  // auto-unlock if remembered
  let saved = null;
  try { saved = localStorage.getItem('lanDropPass') || sessionStorage.getItem('lanDropPass'); } catch { /* ignore */ }
  if (saved) { el.remember.checked = !!localStorage.getItem('lanDropPass'); unlock(saved, el.remember.checked); }
  else el.pass.focus();
})();
