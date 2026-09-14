(() => {
  const $ = (s) => document.querySelector(s);
  const api = window.settingsApi;
  const found = new Map();

  function setMode(mode) {
    $('#cardConnect').classList.toggle('active', mode === 'connect');
    $('#cardHost').classList.toggle('active', mode === 'host');
    if (mode === 'connect') $('#modeConnect').checked = true;
    if (mode === 'host') $('#modeHost').checked = true;
  }
  for (const r of document.querySelectorAll('input[name=mode]')) r.addEventListener('change', () => setMode(r.value));

  function renderFound() {
    const ul = $('#found'); ul.replaceChildren();
    for (const svc of found.values()) {
      const li = document.createElement('li');
      const label = document.createElement('span'); label.textContent = `${svc.host || svc.name}  ·  ${svc.url.replace(/^https:\/\//, '').replace(/\/$/, '')}`;
      const btn = document.createElement('button'); btn.className = 'btn'; btn.textContent = 'Use';
      btn.addEventListener('click', () => { $('#serverUrl').value = svc.url; setMode('connect'); });
      li.append(label, btn); ul.append(li);
    }
    $('#scanMsg').textContent = found.size ? 'Found on this network:' : 'Looking for chutes on this network…';
  }
  api.onDiscovered((svc) => { found.set(svc.url, svc); renderFound(); });

  async function load() {
    const s = await api.get();
    setMode(s.mode || (s.hostConfigured ? 'host' : 'connect'));
    $('#serverUrl').value = s.serverUrl || '';
    $('#ttl').value = s.host.ttlHours; $('#max').value = s.host.maxMB; $('#port').value = s.host.port;
    $('#notifications').checked = !!s.notifications;
    $('#launchAtLogin').checked = !!s.launchAtLogin;
    if (!s.canLoginItem) { $('#launchAtLogin').disabled = true; $('#loginHint').textContent = '(available in the installed app)'; }
    if (s.hostConfigured) {
      $('#pass').placeholder = 'Leave blank to keep the current passphrase';
      $('#passHint').textContent = 'Entering a new passphrase clears everything currently in the drop.';
    }
    if (s.hostUrls) showUrls(s.hostUrls);
  }
  function showUrls(u) {
    const box = $('#urlList'); box.replaceChildren();
    for (const url of u.lan) {
      const a = document.createElement('a'); a.href = '#'; a.textContent = url;
      a.addEventListener('click', (e) => { e.preventDefault(); api.openExternal(url); });
      box.append(a, document.createElement('br'));
    }
    $('#hostUrls').hidden = false;
  }

  $('#cancel').addEventListener('click', () => api.close());
  $('#save').addEventListener('click', async () => {
    const mode = $('#modeHost').checked ? 'host' : $('#modeConnect').checked ? 'connect' : null;
    $('#save').disabled = true; $('#error').hidden = true;
    const r = await api.save({
      mode, serverUrl: $('#serverUrl').value, passphrase: $('#pass').value,
      ttlHours: Number($('#ttl').value), maxMB: Number($('#max').value), port: Number($('#port').value),
      notifications: $('#notifications').checked, launchAtLogin: $('#launchAtLogin').checked,
    });
    $('#save').disabled = false;
    if (!r.ok) { $('#error').textContent = r.error; $('#error').hidden = false; return; }
    $('#pass').value = '';
    if (r.hostUrls) showUrls(r.hostUrls);
    api.close();
  });

  load();
})();
