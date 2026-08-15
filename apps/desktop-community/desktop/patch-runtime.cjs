const fs = require('node:fs');
const path = require('node:path');

const runtimeRoot = path.join(__dirname, '..', 'runtime', 'node_modules');
const workerPath = path.join(runtimeRoot, '@deepseek-ai', 'dsh-host-directory-picker-native', 'lib', 'worker.cjs');

const unsafe = `function readUtf16(koffi, address) {
	const bytes = Buffer.from(koffi.view(address, 32768));
	let end = 0;
	while (end + 1 < bytes.length && bytes[end] !== 0) end += 2;
	return bytes.toString("utf16le", 0, end);
}`;

const safe = `function readUtf16(koffi, address) {
	// Read only the allocated string. Viewing an arbitrary 32 KiB range can
	// cross an inaccessible page and terminate the Node process on Windows.
	const kernel32 = koffi.load("kernel32.dll");
	const lstrlenW = kernel32.func("__stdcall", "lstrlenW", "int", ["void *"]);
	const length = lstrlenW(address);
	if (length <= 0) return "";
	return Buffer.from(koffi.view(address, length * 2)).toString("utf16le");
}`;

if (!fs.existsSync(workerPath)) {
  throw new Error(`Directory picker worker is missing: ${workerPath}`);
}

const source = fs.readFileSync(workerPath, 'utf8');
if (source.includes('const lstrlenW = kernel32.func')) {
  console.log('Windows directory picker safety patch is already applied.');
} else if (!source.includes(unsafe)) {
  throw new Error('Unsupported directory picker worker; refusing to apply an unverified patch.');
} else {
  fs.writeFileSync(workerPath, source.replace(unsafe, safe));
  console.log('Applied Windows directory picker safety patch.');
}
