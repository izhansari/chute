document.getElementById('resume').addEventListener('click', () => window.chute && window.chute.resumeHosting());
document.getElementById('settings').addEventListener('click', () => window.chute && window.chute.openSettings());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && window.chute) window.chute.hide(); });
