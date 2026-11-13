import { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session } from 'electron';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { FontProject, ImportResult, OperationResult } from '../core/types';
import { importDirectory, importBMFont, readProject, saveProject, exportFontFiles, exists, exportPaths } from './files';

protocol.registerSchemesAsPrivileged([{ scheme: 'bmfont', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window: BrowserWindow;
let dirty = false;
let projectPath: string | undefined;
let busy = false;

async function confirmDiscard(): Promise<boolean> {
  if (!dirty) return true;
  const result = await dialog.showMessageBox(window, { type: 'question', title: '保留当前修改？', message: '当前工程有未保存的修改', detail: '继续后这些修改将丢失。你可以取消并先保存工程。', buttons: ['取消', '丢弃修改'], defaultId: 0, cancelId: 0 });
  return result.response === 1;
}

function trusted(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  return event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
}

function handle<T>(name: string, operation: (...args: any[]) => Promise<T | undefined>) {
  ipcMain.handle(name, async (event, ...args): Promise<OperationResult<T>> => {
    if (!trusted(event)) return { error: '请求来源无效。' };
    if (busy) return { error: '正在处理文件，请稍候。' };
    busy = true;
    try { const value = await operation(...args); return value === undefined ? { canceled: true } : { value }; }
    catch (error) { return { error: error instanceof Error ? error.message : '操作失败，请重试。' }; }
    finally { busy = false; }
  });
}

async function replaceDocument(load: () => Promise<ImportResult>): Promise<ImportResult | undefined> {
  if (!await confirmDiscard()) return;
  const result = await load();
  projectPath = result.path; dirty = false; window.setDocumentEdited(false);
  return result;
}

function setupActions() {
  handle('font:directory', async () => {
    const result = await dialog.showOpenDialog(window, { title: '选择字符图片目录', properties: ['openDirectory'] });
    if (result.canceled) return;
    return replaceDocument(() => importDirectory(result.filePaths[0]));
  });
  handle('font:import', async () => {
    const result = await dialog.showOpenDialog(window, { title: '导入 BMFont 文本字体', properties: ['openFile'], filters: [{ name: 'BMFont 文本', extensions: ['fnt'] }] });
    if (result.canceled) return;
    return replaceDocument(() => importBMFont(result.filePaths[0]));
  });
  handle('font:sample', () => replaceDocument(() => importBMFont(path.join(__dirname, 'sample', 'bonusGold.fnt'))));
  handle('font:open', async () => {
    const result = await dialog.showOpenDialog(window, { title: '打开字体工程', properties: ['openFile'], filters: [{ name: 'BMFont Creator 工程', extensions: ['bmfont'] }] });
    if (result.canceled) return;
    return replaceDocument(() => readProject(result.filePaths[0]));
  });
  handle('font:save', async (project: FontProject, saveAs: unknown) => {
    let file = projectPath;
    if (!file || saveAs === true) {
      const result = await dialog.showSaveDialog(window, { title: '保存字体工程', defaultPath: `${safeName(project?.name)}.bmfont`, filters: [{ name: '字体工程', extensions: ['bmfont'] }] });
      if (result.canceled || !result.filePath) return;
      file = result.filePath.endsWith('.bmfont') ? result.filePath : `${result.filePath}.bmfont`;
    }
    await saveProject(project, file); projectPath = file; dirty = false; window.setDocumentEdited(false); return file;
  });
  handle('font:export', async (project: FontProject) => {
    const result = await dialog.showSaveDialog(window, { title: '导出位图字体', defaultPath: `${safeName(project?.name)}.fnt`, filters: [{ name: 'BMFont 描述 + PNG 图集', extensions: ['fnt'] }] });
    if (result.canceled || !result.filePath) return;
    const paths = exportPaths(result.filePath);
    if (await exists(paths.png) || await exists(paths.descriptor)) {
      const answer = await dialog.showMessageBox(window, { type: 'question', message: '替换已有的字体文件？', detail: `将同时写入 ${path.basename(paths.descriptor)} 和 ${path.basename(paths.png)}。`, buttons: ['取消', '替换'], defaultId: 0, cancelId: 0 });
      if (answer.response !== 1) return;
    }
    await exportFontFiles(project, result.filePath, true); return paths.descriptor;
  });
  ipcMain.on('font:dirty', (event, value) => { if (trusted(event) && typeof value === 'boolean') { dirty = value; window.setDocumentEdited(value); } });
}

function safeName(name: unknown): string { return typeof name === 'string' ? name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100) || 'Untitled' : 'Untitled'; }

app.whenReady().then(() => {
  const renderer = path.join(__dirname, 'renderer');
  protocol.handle('bmfont', async request => {
    const url = new URL(request.url);
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (url.hostname !== 'app' || !['index.html', 'index.js', 'index.css'].includes(name)) return new Response('Not found', { status: 404 });
    try {
      const bytes = await readFile(path.join(renderer, name));
      return new Response(bytes, { headers: { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css' : 'text/javascript' } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  window = new BrowserWindow({ width: 1440, height: 920, minWidth: 1080, minHeight: 720, backgroundColor: '#f6f5f1', title: 'BMFont Creator',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => { if (dirty || busy) { event.preventDefault(); if (!busy) void confirmDiscard().then(ok => { if (ok) window.destroy(); }); } });
  setupActions();
  const action = (id: string) => () => window.webContents.send('font:action', id);
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { label: '文件', submenu: [
      { label: '导入图片目录…', accelerator: 'CmdOrCtrl+I', click: action('importDirectory') },
      { label: '导入 BMFont…', click: action('importFont') },
      { label: '打开工程…', accelerator: 'CmdOrCtrl+O', click: action('openProject') },
      { type: 'separator' }, { label: '保存工程', accelerator: 'CmdOrCtrl+S', click: action('saveProject') },
      { label: '工程另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: action('saveAs') },
      { label: '导出位图字体…', accelerator: 'CmdOrCtrl+E', click: action('exportFont') },
    ] },
    { role: 'editMenu' }, { label: '视图', submenu: [{ role: 'togglefullscreen' }, ...(process.env.BMFONT_DEV ? [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }] : [])] },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  void window.loadURL('bmfont://app/');
  app.on('activate', () => { if (!window.isDestroyed()) window.show(); });
});
app.on('window-all-closed', () => app.quit());
