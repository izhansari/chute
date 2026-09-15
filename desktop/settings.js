(() => {
  const $ = (s) => document.querySelector(s);
  const api = window.settingsApi;
  const found = new Map();
  let mode = 'connect';
  let selectedUrl = '';
  let step = 'setup';
  let firstRun = false;
  let lastUrls = null;

  const ICON = {
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 6.2A9.5 9.5 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3 3.6M6.4 6.9A15.6 15.6 0 0 0 2.5 12S6 18 12 18a9.4 9.4 0 0 0 3.6-.7"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    pc: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
    chute: '<path d="M12 3v11m0 0l-4-4m4 4l4-4M5 19h14"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  };
  const svg = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;

  if (api.platform === 'win32') document.documentElement.classList.add('win');
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = svg(el.dataset.icon);
  for (const b of document.querySelectorAll('[data-toggle]')) {
    b.innerHTML = svg('eye');
    b.addEventListener('click', () => {
      const p = $('#' + b.dataset.toggle); const show = p.type === 'password';
      p.type = show ? 'text' : 'password'; b.innerHTML = svg(show ? 'eyeOff' : 'eye'); p.focus();
    });
  }
  $('#copyUrl').innerHTML = svg('copy'); $('#doneCopyUrl').innerHTML = svg('copy');

  // ---------- window sizing ----------
  let fitTimer = null;
  function fit() {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => api.resize($('.titlebar').offsetHeight + $('.content').offsetHeight + 4 + $('.footer').offsetHeight), 30);
  }

  // ---------- steps ----------
  function showStep(name) {
    step = name;
    for (const s of document.querySelectorAll('.step')) s.hidden = s.id !== 'step' + name[0].toUpperCase() + name.slice(1);
    $('#error').textContent = '';
    const primary = $('#primary'), cancel = $('#cancel'), back = $('#back');
    back.hidden = true; cancel.hidden = false;
    if (name === 'welcome') { primary.textContent = 'Get started'; primary.classList.add('wide'); cancel.hidden = true; }
    else if (name === 'setup') { primary.textContent = firstRun ? 'Continue' : 'Save'; primary.classList.remove('wide'); back.hidden = !firstRun; }
    else if (name === 'done') { primary.textContent = 'Open Chute'; primary.classList.add('wide'); cancel.hidden = true; }
    fit();
  }

  function setMode(m) {
    mode = m;
    $('#seg').classList.toggle('host', m === 'host');
    $('#segConnect').classList.toggle('on', m === 'connect');
    $('#segHost').classList.toggle('on', m === 'host');
    $('#panelConnect').hidden = m !== 'connect';
    $('#panelHost').hidden = m !== 'host';
    $('#error').textContent = '';
    fit();
  }
  $('#segConnect').addEventListener('click', () => setMode('connect'));
  $('#segHost').addEventListener('click', () => setMode('host'));

  // ---------- discovery ----------
  function renderFound() {
    const list = $('#hostList');
    list.replaceChildren();
    for (const svc of found.values()) {
      const row = document.createElement('div');
      row.className = 'row host-row' + (svc.url === selectedUrl ? ' selected' : '');
      row.innerHTML = `<div class="pc">${svg('pc')}</div><div class="grow"><div class="label"></div><div class="sub addr"></div></div><div class="tick">${svg('check')}</div>`;
      row.querySelector('.label').textContent = svc.host || svc.name;
      row.querySelector('.sub').textContent = svc.url.replace(/^https:\/\//, '').replace(/\/$/, '');
      row.addEventListener('click', () => { selectedUrl = svc.url; $('#serverUrl').value = svc.url; renderFound(); });
      list.append(row);
    }
    const scan = document.createElement('div');
    scan.className = 'row scanning';
    scan.innerHTML = `<div class="spinner"></div><div class="grow"></div>`;
    scan.querySelector('.grow').textContent = found.size ? 'Still looking for others…' : 'Looking for chutes nearby…';
    list.append(scan);
    fit();
  }
  api.onDiscovered((svc) => {
    found.set(svc.url, svc);
    if (!selectedUrl && found.size === 1) { selectedUrl = svc.url; $('#serverUrl').value = svc.url; }
    renderFound();
  });
  $('#serverUrl').addEventListener('input', () => { selectedUrl = $('#serverUrl').value.trim(); renderFound(); });

  function copyButton(btn, urls) {
    btn.onclick = async () => {
      await api.copy(urls.lan.join('\n'));
      btn.innerHTML = svg('check'); btn.style.color = 'var(--success)';
      setTimeout(() => { btn.innerHTML = svg('copy'); btn.style.color = ''; }, 1400);
    };
  }
  function showUrls(u) {
    lastUrls = u;
    $('#primaryUrl').textContent = u.lan[0]; $('#hostUrls').hidden = false; copyButton($('#copyUrl'), u);
    $('#donePrimaryUrl').textContent = u.lan[0]; $('#doneUrls').hidden = false; copyButton($('#doneCopyUrl'), u);
    fit();
  }

  // ---------- load ----------
  async function load() {
    const s = await api.get();
    firstRun = !s.mode;
    setMode(s.mode || (s.hostConfigured ? 'host' : 'connect'));
    $('#serverUrl').value = s.serverUrl || ''; selectedUrl = s.serverUrl || '';
    const pick = (sel, value, label) => {
      if (![...sel.options].some((o) => Number(o.value) === Number(value))) sel.add(new Option(label, String(value)));
      sel.value = String(value);
    };
    pick($('#ttl'), s.host.ttlHours, `${s.host.ttlHours} hours`);
    pick($('#max'), s.host.maxMB, `${s.host.maxMB} MB`);
    $('#port').value = s.host.port;
    $('#notifications').checked = !!s.notifications;
    $('#launchAtLogin').checked = !!s.launchAtLogin;
    if (!s.canLoginItem) { $('#launchAtLogin').disabled = true; $('#loginHint').hidden = false; }
    if (s.hostConfigured && s.mode === 'host') {
      $('#pass').placeholder = 'Leave blank to keep the current passphrase';
      $('#passHint').textContent = 'Entering a new passphrase clears everything currently in the chute.';
    }
    if (s.mode === 'connect') { $('#joinPass').placeholder = 'Leave blank to keep the current passphrase'; }
    $('#dangerHost').hidden = !(s.mode === 'host' && s.hostConfigured);
    $('#dangerJoin').hidden = s.mode !== 'connect';
    if (!firstRun) { $('#setupTitle').textContent = 'Settings'; $('#setupSub').textContent = s.mode === 'host' ? 'You are hosting this chute.' : 'You are joined to a chute.'; }
    if (s.hostUrls) showUrls(s.hostUrls);
    renderFound();
    showStep(firstRun ? 'welcome' : 'setup');
  }

  // ---------- actions ----------
  $('#back').addEventListener('click', () => showStep('welcome'));
  $('#cancel').addEventListener('click', () => api.close());
  $('#primary').addEventListener('click', async () => {
    if (step === 'welcome') return showStep('setup');
    if (step === 'done') return api.finish();
    $('#primary').disabled = true; $('#error').textContent = '';
    const r = await api.save({
      mode, serverUrl: $('#serverUrl').value,
      passphrase: mode === 'host' ? $('#pass').value : $('#joinPass').value,
      ttlHours: Number($('#ttl').value), maxMB: Number($('#max').value), port: Number($('#port').value),
      notifications: $('#notifications').checked, launchAtLogin: $('#launchAtLogin').checked,
    });
    $('#primary').disabled = false;
    if (!r.ok) { $('#error').textContent = r.error; fit(); return; }
    $('#pass').value = ''; $('#joinPass').value = '';
    if (r.hostUrls) showUrls(r.hostUrls);
    if (firstRun) {
      if (mode === 'host') { $('#doneSub').textContent = 'You are hosting a chute. It runs in the background while this computer is on.'; }
      else { $('#doneSub').textContent = 'You are joined to the chute.'; $('#tip3').textContent = 'Send something to say hi'; $('#tip3sub').textContent = 'Everyone with the passphrase sees it within a few seconds.'; $('#doneUrls').hidden = true; }
      showStep('done');
    } else api.finish();
  });

  $('#emptyBtn').addEventListener('click', async () => { if (await api.hostAction('empty')) $('#error').textContent = ''; });
  $('#stopBtn').addEventListener('click', async () => { if (await api.hostAction('stop')) location.reload(); });
  $('#leaveBtn').addEventListener('click', async () => { if (await api.hostAction('leave')) location.reload(); });

  load();
})();
