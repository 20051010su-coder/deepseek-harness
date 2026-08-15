const fs = require('node:fs');
const path = require('node:path');

const workerPath = path.join(__dirname, '..', 'runtime', 'node_modules', '@deepseek-ai', 'dsh-host-directory-picker-native', 'lib', 'worker.cjs');
const safeWorker = `const { execFile } = require('node:child_process');
if (typeof process.send !== 'function') throw new Error('win32-dialog-worker must run with an IPC channel');
const script = String.raw\`
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select Workspace Directory'
$dialog.ShowNewFolderButton = $true
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($dialog.SelectedPath))
}
$dialog.Dispose()
\`;
execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], { windowsHide: true, encoding: 'utf8' }, (error, stdout, stderr) => {
  if (error) {
    process.send({ kind: 'error', message: stderr || error.message }, () => process.disconnect());
    return;
  }
  const encoded = stdout.trim();
  const selectedPath = encoded ? Buffer.from(encoded, 'base64').toString('utf16le') : null;
  process.send({ kind: 'done', path: selectedPath }, () => process.disconnect());
});
`;

if (!fs.existsSync(workerPath)) throw new Error(`Directory picker worker is missing: ${workerPath}`);
fs.writeFileSync(workerPath, safeWorker);
console.log('Replaced unstable Win32 FFI picker with the Windows Forms picker.');
