'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (s) => ipcRenderer.invoke('settings:save', s),
  close: () => ipcRenderer.send('settings:close'),
  openExternal: (url) => ipcRenderer.send('settings:open-external', url),
  onDiscovered: (cb) => { ipcRenderer.on('discovered', (_e, svc) => cb(svc)); },
  platform: process.platform,
});
