(() => {
  const $ = (s) => document.querySelector(s);
  const api = window.chute.onboarding;
  const found = new Map();
  let mode = null, step = 'welcome', selectedUrl = '', lastUrls = null;
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
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = svg(el.dataset.icon);
  for (const b of document.querySelectorAll('[data-toggle]')) {
    b.innerHTML = svg('eye');
    b.addEventListener('click', () => { const p = $('#' + b.dataset.toggle); const show = p.type === 'password'; p.type = show ? 'text' : 'password'; b.innerHTML = svg(show ? 'eyeOff' : 'eye'); p.focus(); });
  }
  $('#doneCopyUrl').innerHTML = svg('copy');

  const stepEl = { welcome: $('#stepWelcome'), choose: $('#stepChoose'), join: $('#stepJoin'), host: $('#stepHost'), done: $('#stepDone') };
  function showStep(name) {
    step = name;
    const visible = name === 'details' ? (mode === 'host' ? 'host' : 'join') : name;
    for (const [k, el] of Object.entries(stepEl)) el.hidden = k !== visible;
    $('#error').textContent = '';
    const idx = ORDER.indexOf(name);
    [...$('#dots').children].forEach((d, i) => { d.classList.toggle('on', i === idx); d.classList.toggle('done', i < idx); });
    const primary = $('#primary'), back = $('#back');
    primary.hidden = false; back.hidden = true; primary.classList.remove('wide');
    if (name === 'welcome') { primary.textContent = 'Get started'; primary.classList.add('wide'); }
    else if (name === 'choose') { primary.hidden = true; back.hidden = false; }
    else if (name === 'details') { back.hidden = false; primary.textContent = mode === 'host' ? 'Start hosting' : 'Join'; }
    else if (name === 'done') { primary.textContent = 'Open Chute'; primary.classList.add('wide'); }
    document.querySelector('main').scrollTop = 0;
    const focus = { details: mode === 'host' ? '#pass' : '#joinPass' }[name];
    if (focus) setTimeout(() => $(focus).focus({ preventScroll: true }), 60);
    if (name === 'details' && mode === 'connect') api.startDiscovery(); else api.stopDiscovery();
  }
  $('#chooseHost').addEventListener('click', () => { mode = 'host'; showStep('details'); });
  $('#chooseJoin').addEventListener('click', () => { mode = 'connect'; showStep('details'); });

  function renderFound() {
    const list = $('#hostList'); list.replaceChildren();
    for (const svc of found.values()) {
      const row = document.createElement('div');
      row.className = 'row host-row' + (svc.url === selectedUrl ? ' selected' : '');
      row.innerHTML = `<div class="pc">${svg('pc')}</div><div class="grow"><div class="label"></div><div class="sub addr"></div></div><div class="tick">${svg('check')}</div>`;
      row.querySelector('.label').textContent = svc.host || svc.name;
      row.querySelector('.sub').textContent = svc.url.replace(/^https:\/\//, '').replace(/\/$/, '');
      row.addEventListener('click', () => { selectedUrl = svc.url; $('#serverUrl').value = svc.url; renderFound(); });
      list.append(row);
    }
    const scan = document.createElement('div'); scan.className = 'row scanning';
    scan.innerHTML = `<div class="spinner"></div><div class="grow"></div>`;
    scan.querySelector('.grow').textContent = found.size ? 'Still looking for others…' : 'Looking for chutes nearby…';
    list.append(scan);
  }
  api.onDiscovered((svc) => { found.set(svc.url, svc); if (!selectedUrl && found.size === 1) { selectedUrl = svc.url; $('#serverUrl').value = svc.url; } renderFound(); });
  let probeTimer = null;
  $('#serverUrl').addEventListener('input', () => {
    selectedUrl = $('#serverUrl').value.trim(); renderFound();
    clearTimeout(probeTimer); const hint = $('#addrHint');
    if (!selectedUrl) { hint.textContent = ''; return; }
    probeTimer = setTimeout(async () => { hint.textContent = 'Checking…'; hint.style.color = ''; const r = await api.probe(selectedUrl); hint.textContent = r.ok ? `Reachable: ${r.host} is a Chute host.` : r.reason; hint.style.color = r.ok ? 'var(--success)' : 'var(--danger)'; }, 700);
  });

  $('#back').addEventListener('click', () => showStep(step === 'details' ? 'choose' : 'welcome'));
  $('#primary').addEventListener('click', async () => {
    if (step === 'welcome') return showStep('choose');
    if (step === 'done') return api.finish();
    $('#primary').disabled = true; $('#error').textContent = '';
    const r = await api.save({
      mode, serverUrl: $('#serverUrl').value, passphrase: mode === 'host' ? $('#pass').value : $('#joinPass').value,
      ttlHours: Number($('#ttl').value), maxMB: Number($('#max').value), maxTotalMB: Number($('#maxTotal').value), port: Number($('#port').value),
      notifications: true, launchAtLogin: $('#doneLaunch').checked,
    });
    $('#primary').disabled = false;
    if (!r.ok) { $('#error').textContent = r.error; return; }
    if (mode === 'host') { $('#doneSub').textContent = 'You are hosting a chute. It runs in the background while this computer is on.'; if (r.hostUrls) { $('#donePrimaryUrl').textContent = r.hostUrls.lan[0]; $('#doneUrls').hidden = false; $('#doneCopyUrl').onclick = () => api.copy(r.hostUrls.lan.join('\n')); } }
    else { $('#doneSub').textContent = 'You are joined to the chute.'; $('#tip3').textContent = 'Send something to say hi'; $('#tip3sub').textContent = 'Everyone with the passphrase sees it within a few seconds.'; }
    showStep('done');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT' && !$('#primary').hidden) { e.preventDefault(); $('#primary').click(); } });
  $('#doneLaunch').addEventListener('change', () => api.update({ launchAtLogin: $('#doneLaunch').checked }));
  for (const d of document.querySelectorAll('details.adv')) d.addEventListener('toggle', (e) => { if (e.target.open) setTimeout(() => e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80); });

  (async () => {
    const s = await api.get();
    if (!s.canLoginItem) { $('#doneLaunch').disabled = true; $('#doneLoginHint').textContent = 'Available in the installed app.'; }
    showStep('welcome');
  })();
})();
