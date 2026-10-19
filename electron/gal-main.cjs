/* AI START */
'use strict';

const { app, BrowserWindow, Menu, ipcMain, protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const { resolveAppFile } = require('./gal-root.cjs');

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

function packageRoot() {
  return app.isPackaged
    ? path.join(app.getAppPath(), 'dist-gal')
    : path.join(__dirname, '..', 'dist-gal');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#070e17',
    autoHideMenuBar: true,
    title: '庄园出逃',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'gal-preload.cjs'),
    },
    show: false,
  });
  win.loadURL('app://local/gal-desktop.html');
  win.once('ready-to-show', () => win.show());
  return win;
}

ipcMain.handle('gal:request-exit', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || event.sender !== win.webContents) return 'rejected';
  setImmediate(() => {
    if (!win.isDestroyed()) win.close();
  });
  return 'accepted';
});

app.whenReady().then(() => {
  const root = packageRoot();
  protocol.handle('app', async (request) => {
    let pathname = '/';
    try { pathname = new URL(request.url).pathname; } catch { return new Response('bad url', { status: 400 }); }
    const file = resolveAppFile(root, pathname);
    if (!file) return new Response('forbidden', { status: 403 });
    try {
      const body = await fs.promises.readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
      return new Response(body, { headers: { 'content-type': type } });
    } catch {
      return new Response('missing', { status: 404 });
    }
  });
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
/* AI END */
