'use strict';
const { contextBridge, ipcRenderer } = require('electron');
function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('callback_required');
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener); return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld('vxchat', {
  command: command => ipcRenderer.invoke('vxchat:command', command),
  subscribe: callback => subscribe('vxchat:state', callback),
  preferences: callback => subscribe('vxchat:preferences', callback),
  downloads: callback => subscribe('vxchat:downloads', callback),
  updates: callback => subscribe('vxchat:updates',callback)
});
