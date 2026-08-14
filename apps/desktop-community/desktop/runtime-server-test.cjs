const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function probe(port) {
  return new Promise((resolve) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

function stop(child) {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

async function main() {
  const executable = path.resolve(option('--executable') || process.execPath);
  const entry = path.resolve(option('--entry'));
  const electron = process.argv.includes('--electron');
  const port = await freePort();
  let output = '';
  let exited;
  const child = spawn(executable, [entry, 'web', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    windowsHide: true,
    env: { ...process.env, ...(electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}), NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => { output = `${output}${chunk}`.slice(-30000); });
  child.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-30000); });
  child.once('exit', (code) => { exited = code; });
  const deadline = Date.now() + 120000;
  try {
    while (Date.now() < deadline) {
      if (exited !== undefined) throw new Error(`DSH exited with code ${exited}\n${output}`);
      if (await probe(port)) {
        console.log(`DSH Web runtime test passed on 127.0.0.1:${port}`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`DSH Web did not respond within 120 seconds.\n${output}`);
  } finally {
    stop(child);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
