/* AI START */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('galDesktop', {
  requestExit: () => ipcRenderer.invoke('gal:request-exit'),
});
/* AI END */
