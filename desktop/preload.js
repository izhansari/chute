'use strict';
// Bridge between the (remote) LAN Drop page and the desktop shell. Keep it tiny.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lanDrop', {
  platform: process.platform,
  notify: (payload) => ipcRenderer.send('notify', { title: String(payload && payload.title || ''), body: String(payload && payload.body || '') }),
  openSettings: () => ipcRenderer.send('open-settings'),
  info: () => ipcRenderer.invoke('app-info'),
  onDropFiles: (cb) => { ipcRenderer.on('drop-files', (_e, files) => cb(files)); },
  onDropText: (cb) => { ipcRenderer.on('drop-text', (_e, text) => cb(String(text))); },
});
