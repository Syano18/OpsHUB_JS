const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronUpdater', {
  checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
  getState: () => ipcRenderer.invoke('updater:get-state'),
  installUpdate: () => ipcRenderer.invoke('updater:install-update'),
  onStatus: (callback) => {
    const listener = (_event, state) => {
      callback(state);
    };

    ipcRenderer.on('updater:status', listener);

    return () => {
      ipcRenderer.removeListener('updater:status', listener);
    };
  },
});
