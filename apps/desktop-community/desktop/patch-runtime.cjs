const fs = require('node:fs');
const path = require('node:path');

const workerPath = path.join(__dirname, '..', 'runtime', 'node_modules', '@deepseek-ai', 'dsh-host-directory-picker-native', 'lib', 'worker.cjs');
const sourcePath = path.join(__dirname, 'windows-directory-picker-worker.cjs');

if (!fs.existsSync(workerPath)) throw new Error(`Directory picker worker is missing: ${workerPath}`);
if (!fs.existsSync(sourcePath)) throw new Error(`Replacement directory picker is missing: ${sourcePath}`);
fs.copyFileSync(sourcePath, workerPath);
console.log('Replaced unstable Win32 FFI picker with the UTF-8 Windows Forms picker.');
