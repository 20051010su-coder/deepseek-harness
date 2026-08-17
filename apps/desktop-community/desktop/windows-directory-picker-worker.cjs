const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (typeof process.send !== 'function') throw new Error('win32-dialog-worker must run with an IPC channel');

const resultFile = path.join(os.tmpdir(), `dsh-picker-${process.pid}-${Date.now()}.txt`);
const script = String.raw`
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select Workspace Directory'
$dialog.ShowNewFolderButton = $true
$dialog.SelectedPath = [Environment]::CurrentDirectory
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [IO.File]::WriteAllText($env:DSH_PICKER_RESULT_FILE, $dialog.SelectedPath, [Text.UTF8Encoding]::new($false))
}
$dialog.Dispose()
`;

execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], {
  windowsHide: false,
  env: { ...process.env, DSH_PICKER_RESULT_FILE: resultFile }
}, (error, _stdout, stderr) => {
  if (error) {
    process.send({ kind: 'error', message: stderr.toString('utf8') || error.message }, () => process.disconnect());
    return;
  }
  let selectedPath = null;
  try {
    if (fs.existsSync(resultFile)) selectedPath = fs.readFileSync(resultFile, 'utf8');
  } finally {
    try { fs.unlinkSync(resultFile); } catch {}
  }
  process.send({ kind: 'done', path: selectedPath }, () => process.disconnect());
});
