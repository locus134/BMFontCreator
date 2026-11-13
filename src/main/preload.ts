import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../core/types';

const api: DesktopAPI = {
  importDirectory: () => ipcRenderer.invoke('font:directory'),
  importFont: () => ipcRenderer.invoke('font:import'),
  openProject: () => ipcRenderer.invoke('font:open'),
  loadSample: () => ipcRenderer.invoke('font:sample'),
  saveProject: (project, saveAs) => ipcRenderer.invoke('font:save', project, saveAs),
  exportFont: project => ipcRenderer.invoke('font:export', project),
  setDirty: dirty => ipcRenderer.send('font:dirty', dirty),
  onAction: callback => {
    const listener = (_event: unknown, action: string) => callback(action);
    ipcRenderer.on('font:action', listener);
    return () => ipcRenderer.removeListener('font:action', listener);
  },
};
contextBridge.exposeInMainWorld('desktop', api);
