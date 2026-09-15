(() => {
  const $ = (s) => document.querySelector(s);
  const api = window.settingsApi;
  const found = new Map();
  let mode = null;          // 'host' | 'connect'
  let selectedUrl = '';
  let step = 'welcome';
  let firstRun = false;
  let lastUrls = null;
  const ORDER = ['welcome', 'choose', 'details', 'done'];

  const ICON = {
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 6.2A9.5 9.5 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3 3.6M6.4 6.9A15.6 15.6 0 0 0 2.5 12S6 18 12 18a9.4 9.4 0 0 0 3.6-.7"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    pc: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
    chute: '<path d="M12 3v11m0 0l-4-4m4 4l4-4M5 19h14"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
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
  const stepEl = { welcome: $('#stepWelcome'), choose: $('#stepChoose'), join: $('#stepJoin'), host: $('#stepHost'), done: $('#stepDone') };
  function showStep(name) {
    step = name;
    const visible = name === 'details' ? (mode === 'host' ? 'host' : 'join') : name;
    for (const [k, el] of Object.entries(stepEl)) el.hidden = k !== visible;
    $('#error').textContent = '';

    // settings-only extras live at the end of the details step
    const extras = $('#extras');
    if (!firstRun && name === 'details') { stepEl[visible].append(extras); extras.hidden = false; } else extras.hidden = true;

    // progress dots (onboarding only)
    const dots = $('#dots');
    dots.hidden = !firstRun;
    const idx = ORDER.indexOf(name);
    [...dots.children].forEach((d, i) => { d.classList.toggle('on', i === idx); d.classList.toggle('done', i < idx); });

    const primary = $('#primary'), cancel = $('#cancel'), back = $('#back');
    primary.hidden = false; back.hidden = true; cancel.hidden = true; primary.classList.remove('wide');
    if (name === 'welcome') { primary.textContent = 'Get started'; primary.classList.add('wide'); }
    else if (name === 'choose') { primary.hidden = true; back.hidden = false; }
    else if (name === 'details') {
      if (firstRun) { back.hidden = false; primary.textContent = mode === 'host' ? 'Start hosting' : 'Join'; }
      else { cancel.hidden = false; primary.textContent = 'Save'; }
    }
    else if (name === 'done') { primary.textContent = 'Open Chute'; primary.classList.add('wide'); }
    fit();
    const focus = { details: mode === 'host' ? '#pass' : '#joinPass' }[name];
    if (focus) setTimeout(() => $(focus).focus(), 60);
  }
  function chooseMode(m) { mode = m; showStep('details'); }
  $('#chooseHost').addEventListener('click', () => chooseMode('host'));
  $('#chooseJoin').addEventListener('click', () => chooseMode('connect'));

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
    if (!$('#connJoin').hidden && $('#serverUrl').value === svc.url) $('#connHost').textContent = svc.host || svc.name;
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
    mode = s.mode || null;
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
    $('#doneLaunch').checked = !!s.launchAtLogin;
    if (!s.canLoginItem) { $('#launchAtLogin').disabled = true; $('#loginHint').hidden = false; $('#doneLaunch').disabled = true; $('#doneLoginHint').textContent = 'Available in the installed app.'; }
    if (s.hostConfigured && s.mode === 'host') {
      $('#pass').placeholder = 'Leave blank to keep the current passphrase';
      $('#passHint').textContent = 'Entering a new passphrase clears everything currently in the chute.';
    }
    if (s.mode === 'connect') $('#joinPass').placeholder = 'Leave blank to keep the current passphrase';
    $('#dangerHost').hidden = !(s.mode === 'host' && s.hostConfigured);
    $('#dangerJoin').hidden = s.mode !== 'connect';
    $('#rowStop').hidden = !!s.hostPaused; $('#rowResume').hidden = !s.hostPaused;
    $('#downloadDir').textContent = s.downloadDir || '';
    const fmtTtl = (h) => (!h ? '…' : h % 24 === 0 ? (h / 24) + ' day' + (h === 24 ? '' : 's') : h + ' hours');
    const fmtMB = (mb) => (!mb ? '…' : mb >= 1024 ? (mb / 1024) + ' GB' : mb + ' MB');
    if (s.mode === 'connect' && !firstRun) {
      $('#connJoin').hidden = false;
      $('#connHost').textContent = (found.get(s.serverUrl) && found.get(s.serverUrl).host) || (s.pinnedHost || '').split(':')[0];
      $('#connAddr').textContent = s.pinnedHost || '';
      const st = $('#connState');
      st.textContent = s.connState === 'online' ? 'Connected' : s.connState === 'offline' ? 'Host offline' : s.connState === 'locked' ? 'Locked' : 'Connecting…';
      st.className = 'state ' + (s.connState === 'online' ? 'ok' : s.connState === 'offline' ? 'bad' : 'pause');
      $('#connLimits').textContent = s.serverInfo ? `Items expire after ${fmtTtl(s.serverInfo.ttlHours)} · up to ${fmtMB(s.serverInfo.maxMB)} per item` : 'Unlock the chute to see the host\'s settings';
    }
    if (s.mode === 'host' && !firstRun) {
      $('#connHostInfo').hidden = false;
      const st = $('#hostState');
      if (s.hostPaused) { $('#hostStateLabel').textContent = 'Hosting is paused'; $('#hostStateSub').textContent = 'The chute is off the network.'; st.textContent = 'Paused'; st.className = 'state pause'; }
      else { $('#hostStateLabel').textContent = 'Hosting'; $('#hostStateSub').textContent = `${s.connectedDevices} device${s.connectedDevices === 1 ? '' : 's'} connected right now`; st.textContent = 'Live'; st.className = 'state ok'; }
    }
    if (!firstRun) {
      document.documentElement.classList.add('compact');
      $('#hostTitle').textContent = 'Settings'; $('#hostSub').textContent = 'You are hosting this chute.';
      $('#joinTitle').textContent = 'Settings'; $('#joinSub').textContent = 'You are joined to a chute.';
    }
    if (s.hostUrls) showUrls(s.hostUrls);
    renderFound();
    showStep(firstRun ? 'welcome' : 'details');
  }

  // ---------- actions ----------
  $('#back').addEventListener('click', () => showStep(step === 'details' ? 'choose' : 'welcome'));
  $('#cancel').addEventListener('click', () => api.close());
  $('#primary').addEventListener('click', async () => {
    if (step === 'welcome') return showStep('choose');
    if (step === 'done') return api.finish();
    $('#primary').disabled = true; $('#error').textContent = '';
    const r = await api.save({
      mode, serverUrl: $('#serverUrl').value,
      passphrase: mode === 'host' ? $('#pass').value : $('#joinPass').value,
      ttlHours: Number($('#ttl').value), maxMB: Number($('#max').value), port: Number($('#port').value),
      notifications: $('#notifications').checked, launchAtLogin: firstRun ? $('#doneLaunch').checked : $('#launchAtLogin').checked,
    });
    $('#primary').disabled = false;
    if (!r.ok) { $('#error').textContent = r.error; fit(); return; }
    $('#pass').value = ''; $('#joinPass').value = '';
    if (r.hostUrls) showUrls(r.hostUrls);
    if (firstRun) {
      if (mode === 'host') $('#doneSub').textContent = 'You are hosting a chute. It runs in the background while this computer is on.';
      else { $('#doneSub').textContent = 'You are joined to the chute.'; $('#tip3').textContent = 'Send something to say hi'; $('#tip3sub').textContent = 'Everyone with the passphrase sees it within a few seconds.'; $('#doneUrls').hidden = true; }
      showStep('done');
    } else api.finish();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT' && !$('#primary').hidden) { e.preventDefault(); $('#primary').click(); }
  });
  $('#doneLaunch').addEventListener('change', () => api.update({ launchAtLogin: $('#doneLaunch').checked }));

  $('#lockBtn').addEventListener('click', async () => { await api.lockDevice(); api.close(); });
  $('#emptyBtn').addEventListener('click', async () => { if (await api.hostAction('empty')) $('#error').textContent = ''; });
  $('#stopBtn').addEventListener('click', async () => { if (await api.hostAction('stop')) location.reload(); });
  $('#resumeBtn').addEventListener('click', async () => { if (await api.hostAction('resume')) location.reload(); });
  $('#deleteBtn').addEventListener('click', async () => { if (await api.hostAction('delete')) location.reload(); });
  $('#chooseDir').addEventListener('click', async () => { $('#downloadDir').textContent = await api.chooseDir(); fit(); });
  $('#leaveBtn').addEventListener('click', async () => { if (await api.hostAction('leave')) location.reload(); });

  load();
})();
