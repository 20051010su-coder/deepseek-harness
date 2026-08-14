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

function settingsPath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json');
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
  const packageFile = require.resolve('@deepseek-ai/dsh/package.json');
  return path.join(path.dirname(packageFile), 'lib', 'bin.js');
}

function waitForServer(port, timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, (response) => {
        response.resume();
        resolve();
      });
      request.on('error', () => {
        if (Date.now() - started >= timeoutMs) {
          reject(new Error('DeepSeek Harness did not become ready in time.'));
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
  serverPort = await findPort();
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    DSH_DESKTOP_COMMUNITY: '1',
    NO_COLOR: '1'
  };
  serverProcess = spawn(process.execPath, [dshEntry(), 'web', '--port', String(serverPort)], {
    cwd: selectedWorkspace(),
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProcess.stdout.on('data', (chunk) => console.log(`[dsh] ${chunk}`));
  serverProcess.stderr.on('data', (chunk) => console.error(`[dsh] ${chunk}`));
  serverProcess.once('exit', (code) => {
    if (!quitting && code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(APP_NAME, `DeepSeek Harness background service stopped (code ${code}).`);
    }
  });
  await waitForServer(serverPort);
}

function loadingPage() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png').replaceAll('\\', '/');
  const workspace = selectedWorkspace().replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
    <html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file:; style-src 'unsafe-inline'">
    <style>body{margin:0;height:100vh;display:grid;place-items:center;background:#07122e;color:#eaf7ff;font:14px system-ui}.card{text-align:center}.logo{width:112px;height:112px}.spinner{width:28px;height:28px;margin:22px auto;border:3px solid #203a6a;border-top-color:#15c8ff;border-radius:50%;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}small{color:#8ea9cf}</style></head>
    <body><div class="card"><img class="logo" src="file:///${iconPath}"><h2>${APP_NAME}</h2><div class="spinner"></div><p>正在启动 DeepSeek Harness…</p><small>${workspace}</small></div></body></html>`)} `;
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
  await mainWindow.loadURL(loadingPage());
  try {
    await startServer();
    await mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  } catch (error) {
    dialog.showErrorBox(APP_NAME, error.message);
  }
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

