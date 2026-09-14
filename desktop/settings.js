(() => {
  const $ = (s) => document.querySelector(s);
  const api = window.settingsApi;
  const found = new Map();
  let mode = 'connect';
  let selectedUrl = '';

  const ICON = {
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 6.2A9.5 9.5 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3 3.6M6.4 6.9A15.6 15.6 0 0 0 2.5 12S6 18 12 18a9.4 9.4 0 0 0 3.6-.7"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    pc: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
  };
  const svg = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;

  if (api.platform === 'win32') document.documentElement.classList.add('win');
  $('#togglePass').innerHTML = svg('eye');
  $('#copyUrl').innerHTML = svg('copy');

  // Size the window to its content instead of scrolling (macOS animates the change).
  let fitTimer = null;
  function fit() {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      const h = $('.titlebar').offsetHeight + $('.content').offsetHeight + 4 + $('.footer').offsetHeight;
      api.resize(h);
    }, 30);
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

  $('#togglePass').addEventListener('click', () => {
    const p = $('#pass'); const show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    $('#togglePass').innerHTML = svg(show ? 'eyeOff' : 'eye');
    p.focus();
  });

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
    if (!selectedUrl && found.size === 1) { selectedUrl = svc.url; $('#serverUrl').value = svc.url; } // lone host: pick it
    renderFound();
  });
  $('#serverUrl').addEventListener('input', () => { selectedUrl = $('#serverUrl').value.trim(); renderFound(); });

  function showUrls(u) {
    $('#primaryUrl').textContent = u.lan[0];
    $('#hostUrls').hidden = false;
    fit();
    $('#copyUrl').onclick = async () => {
      await api.copy(u.lan.join('\n'));
      $('#copyUrl').innerHTML = svg('check'); $('#copyUrl').style.color = 'var(--success)';
      setTimeout(() => { $('#copyUrl').innerHTML = svg('copy'); $('#copyUrl').style.color = ''; }, 1400);
    };
  }

  async function load() {
    const s = await api.get();
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
    if (s.hostConfigured) {
      $('#pass').placeholder = 'Leave blank to keep the current passphrase';
      $('#passHint').textContent = 'Entering a new passphrase clears everything currently in the chute.';
    }
    if (s.mode) $('#save').textContent = 'Save';
    if (s.hostUrls) showUrls(s.hostUrls);
    renderFound();
    fit();
  }

  $('#cancel').addEventListener('click', () => api.close());
  $('#save').addEventListener('click', async () => {
    $('#save').disabled = true; $('#error').textContent = '';
    const r = await api.save({
      mode, serverUrl: $('#serverUrl').value, passphrase: $('#pass').value,
      ttlHours: Number($('#ttl').value), maxMB: Number($('#max').value), port: Number($('#port').value),
      notifications: $('#notifications').checked, launchAtLogin: $('#launchAtLogin').checked,
    });
    $('#save').disabled = false;
    if (!r.ok) { $('#error').textContent = r.error; fit(); return; }
    $('#pass').value = '';
    if (r.hostUrls) showUrls(r.hostUrls);
    api.close();
  });

  load();
})();
