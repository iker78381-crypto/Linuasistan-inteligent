const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('linuDesktop', {
  platform: process.platform,
  isDesktopApp: true,
});
