'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (s) => ipcRenderer.invoke('settings:save', s),
  close: () => ipcRenderer.send('settings:close'),
  finish: () => ipcRenderer.send('settings:finish'),
  hostAction: (what) => ipcRenderer.invoke('settings:host-action', String(what)),
  update: (patch) => ipcRenderer.invoke('settings:update', patch),
  lockDevice: () => ipcRenderer.invoke('settings:lock-device'),
  openExternal: (url) => ipcRenderer.send('settings:open-external', url),
  copy: (text) => ipcRenderer.invoke('settings:copy', String(text)),
  resize: (h) => ipcRenderer.send('settings:resize', Number(h)),
  onDiscovered: (cb) => { ipcRenderer.on('discovered', (_e, svc) => cb(svc)); },
  platform: process.platform,
});
