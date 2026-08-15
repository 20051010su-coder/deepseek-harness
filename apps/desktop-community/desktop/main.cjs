const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const APP_NAME = 'DSH Desktop Community';
const START_PORT = 3080;
let mainWindow;
let serverProcess;
let serverPort;
let quitting = false;
let recentServerOutput = '';
let serverReady = false;

function settingsPath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json');
}

function logPath() {
  return path.join(app.getPath('userData'), 'desktop.log');
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.mkdirSync(path.dirname(logPath()), { recursive: true });
    fs.appendFileSync(logPath(), line);
  } catch {}
  console.log(message);
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

function selectedWorkspace() {
  const candidate = readSettings().workspace;
  return candidate && fs.existsSync(candidate) ? candidate : app.getPath('documents');
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, '127.0.0.1');
  });
}

async function findPort() {
  for (let port = START_PORT; port < START_PORT + 30; port += 1) {
    if (await portIsFree(port)) return port;
  }
  throw new Error('No local port is available for DeepSeek Harness.');
}

function dshEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  }
  return path.join(__dirname, '..', 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
}

function waitForServer(port, child, timeoutMs = 300000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    child.once('exit', (code) => {
      finish(reject, new Error(`DeepSeek Harness 后台服务启动失败（退出代码 ${code}）。\n\n${recentServerOutput.slice(-1200)}`));
    });
    const probe = () => {
      if (settled) return;
      const request = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, (response) => {
        response.resume();
        finish(resolve);
      });
      request.on('error', () => {
        if (Date.now() - started >= timeoutMs) {
          finish(reject, new Error(`DeepSeek Harness 在 5 分钟内未能启动。\n\n${recentServerOutput.slice(-1200)}`));
        } else {
          setTimeout(probe, 350);
        }
      });
      request.on('timeout', () => request.destroy());
    };
    probe();
  });
}

function stopServer() {
  if (!serverProcess) return;
  const child = serverProcess;
  serverProcess = undefined;
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore'
    });
  } else {
    child.kill('SIGTERM');
  }
}

async function startServer() {
  stopServer();
  serverReady = false;
  recentServerOutput = '';
  serverPort = await findPort();
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    DSH_DESKTOP_COMMUNITY: '1',
    NO_COLOR: '1'
  };
  serverProcess = spawn(process.execPath, ['--expose-internals', dshEntry(), 'web', '--port', String(serverPort)], {
    cwd: selectedWorkspace(),
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const recordOutput = (stream, chunk) => {
    const text = chunk.toString();
    recentServerOutput = `${recentServerOutput}${text}`.slice(-8000);
    log(`[dsh:${stream}] ${text.trimEnd()}`);
  };
  serverProcess.stdout.on('data', (chunk) => recordOutput('stdout', chunk));
  serverProcess.stderr.on('data', (chunk) => recordOutput('stderr', chunk));
  serverProcess.once('exit', (code) => {
    if (serverReady && !quitting && code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(APP_NAME, `DeepSeek Harness background service stopped (code ${code}).`);
    }
  });
  log(`Starting dsh on 127.0.0.1:${serverPort} with workspace ${selectedWorkspace()}`);
  await waitForServer(serverPort, serverProcess);
  serverReady = true;
  log(`dsh is ready on 127.0.0.1:${serverPort}`);
}

function loadingPage() {
  return path.join(__dirname, 'loading.html');
}

async function chooseWorkspace() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 DSH 工作目录',
    defaultPath: selectedWorkspace(),
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return;
  writeSettings({ ...readSettings(), workspace: result.filePaths[0] });
  await reloadHarness();
}

async function reloadHarness() {
  await mainWindow.loadFile(loadingPage());
  try {
    await startServer();
    await mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  } catch (error) {
    log(`Startup failed: ${error.stack || error.message}`);
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: `${APP_NAME} 启动失败`,
      message: 'DeepSeek Harness 后台服务未能启动',
      detail: `${error.message}\n\n日志文件：${logPath()}`,
      buttons: ['重试', '打开日志位置', '退出'],
      defaultId: 0,
      cancelId: 2
    });
    if (result.response === 0) return reloadHarness();
    if (result.response === 1) shell.showItemInFolder(logPath());
    if (result.response === 2) app.quit();
  }
}

async function ensureFirstWorkspace() {
  const settings = readSettings();
  if (settings.workspace && fs.existsSync(settings.workspace)) return true;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '首次使用：选择 DSH 工作目录',
    message: 'DSH 只会把这个文件夹作为默认工作位置，你以后可以从“文件”菜单修改。',
    defaultPath: app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return false;
  writeSettings({ ...settings, workspace: result.filePaths[0] });
  return true;
}

function installMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '选择工作目录…', accelerator: 'CmdOrCtrl+O', click: chooseWorkspace },
        { label: '重新启动 DSH', accelerator: 'CmdOrCtrl+R', click: reloadHarness },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' },
        { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新界面' }, { role: 'forceReload', label: '强制刷新' },
        { type: 'separator' }, { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' },
        { type: 'separator' }, { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: 'DeepSeek Harness 项目主页', click: () => shell.openExternal('https://github.com/deepseek-ai/deepseek-harness') },
        { label: '社区版项目主页', click: () => shell.openExternal('https://github.com/20051010su-coder/deepseek-harness') },
        { label: '打开日志位置', click: () => shell.showItemInFolder(logPath()) },
        { type: 'separator' },
        { label: `关于 ${APP_NAME}`, click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: `关于 ${APP_NAME}`, message: APP_NAME, detail: `非官方社区桌面封装\n版本 ${app.getVersion()}\n\nDeepSeek Harness 及其商标归原权利人所有。` }) }
      ]
    }
  ]));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#07122e',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${serverPort}`)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  installMenu();
  await mainWindow.loadFile(loadingPage());
  if (!await ensureFirstWorkspace()) {
    app.quit();
    return;
  }
  await reloadHarness();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(createWindow);
}

app.on('before-quit', () => {
  quitting = true;
  stopServer();
});

app.on('window-all-closed', () => app.quit());
