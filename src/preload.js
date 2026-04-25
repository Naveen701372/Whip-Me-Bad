const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  // Overlay
  onTriggerWhip: (fn) => ipcRenderer.on('trigger-whip', (_, label) => fn(label)),
  onWarmup: (fn) => ipcRenderer.on('warmup', () => fn()),
  onSetVolume: (fn) => ipcRenderer.on('set-volume', (_, vol) => fn(vol)),
  onSetSounds: (fn) => ipcRenderer.on('set-sounds', (_, paths) => fn(paths)),
  whipDone: () => ipcRenderer.send('whip-done'),
  warmupDone: () => ipcRenderer.send('warmup-done'),

  // Onboarding
  pickFolder: () => ipcRenderer.send('pick-folder'),
  onFolderPicked: (fn) => ipcRenderer.on('folder-picked', (_, path) => fn(path)),
  onboardingDone: () => ipcRenderer.send('onboarding-done'),
  getTrayBounds: () => ipcRenderer.invoke('get-tray-bounds'),

  // Key capture
  keyCaptured: (data) => ipcRenderer.send('key-captured', data),
});
