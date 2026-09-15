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
});
