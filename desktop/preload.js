'use strict';
// Bridge between the (remote) Chute page and the desktop shell. Keep it tiny.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chute', {
  platform: process.platform,
  notify: (p) => ipcRenderer.send('notify', { title: String(p && p.title || ''), body: String(p && p.body || ''), count: Number(p && p.count) || 0 }),
  clearUnread: () => ipcRenderer.send('clear-unread'),
  openSettings: () => ipcRenderer.send('open-settings'),
  chooseFiles: () => ipcRenderer.send('choose-files'),
  hide: () => ipcRenderer.send('hide'),
  togglePinned: () => ipcRenderer.invoke('toggle-pinned'),
  info: () => ipcRenderer.invoke('app-info'),
  takePassphrase: () => ipcRenderer.invoke('take-passphrase'),
  thumbnail: (f) => ipcRenderer.invoke('thumbnail', { name: String(f.name || ''), bytes: f.bytes }),
  quickLook: (f) => ipcRenderer.invoke('quick-look', { name: String(f.name || ''), bytes: f.bytes }),
  onDropFiles: (cb) => { ipcRenderer.on('drop-files', (_e, files) => cb(files)); },
  onDropText: (cb) => { ipcRenderer.on('drop-text', (_e, text) => cb(String(text))); },
  onShown: (cb) => { ipcRenderer.on('shown', () => cb()); },
  onPinned: (cb) => { ipcRenderer.on('pinned', (_e, v) => cb(!!v)); },
  onLock: (cb) => { ipcRenderer.on('lock', () => cb()); },
  onTrayDrag: (cb) => { ipcRenderer.on('tray-drag', (_e, on) => cb(!!on)); },
  dragInWindow: (on) => ipcRenderer.send('drag-in-window', !!on),
  stage: (f) => ipcRenderer.invoke('stage', { id: String(f.id), name: String(f.name || 'file'), bytes: f.bytes }),
  startDrag: (id) => ipcRenderer.send('start-drag', String(id)),
  unstage: (ids) => ipcRenderer.send('unstage', ids),
  serverInfo: (info) => ipcRenderer.send('server-info', { ttlHours: info.ttlHours, maxMB: info.maxMB }),
  connState: (st) => ipcRenderer.send('conn-state', String(st)),
  stopHosting: () => ipcRenderer.send('stop-hosting'),
  resumeHosting: () => ipcRenderer.send('resume-hosting'),
});
