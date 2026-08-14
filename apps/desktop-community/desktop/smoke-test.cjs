const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(manifest.build.productName, 'DSH Desktop Community');
assert.equal(manifest.build.appId, 'community.dsh.desktop');
assert.ok(manifest.dependencies['@deepseek-ai/dsh']);
assert.ok(fs.existsSync(path.join(root, 'assets', 'icon.png')), 'icon.png is missing');
assert.ok(fs.existsSync(path.join(root, 'assets', 'icon.ico')), 'icon.ico is missing');
assert.ok(fs.existsSync(path.join(root, 'desktop', 'loading.html')), 'loading.html is missing');
assert.equal(manifest.build.asar, false, 'dsh must remain unpacked for the background process');
console.log('Desktop packaging smoke test passed.');
