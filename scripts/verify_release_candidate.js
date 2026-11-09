'use strict';
// Read-only local macOS release preflight. No upload, signing, trust or install.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const asar = require('@electron/asar');
const yaml = require('js-yaml');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const dist = path.join(root, 'dist');
const hash = (file, algorithm) => createHash(algorithm).update(fs.readFileSync(file)).digest(algorithm === 'sha512' ? 'base64' : 'hex');
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '.DS_Store') return [];
    const name = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected source symlink: ${name}`);
    return entry.isDirectory() ? walk(name) : [path.relative(root, name)];
  });
}
function bundleTree(directory, prefix = '') {
  return fs.readdirSync(path.join(directory, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const name = path.join(prefix, entry.name), file = path.join(directory, name);
    if (entry.isSymbolicLink()) return [[name, 'link', fs.readlinkSync(file)]];
    if (entry.isDirectory()) return [[name, 'directory'], ...bundleTree(directory, name)];
    assert(entry.isFile(), `Unexpected bundle entry: ${name}`);
    return [[name, 'file', hash(file, 'sha256')]];
  });
}
assert.equal(process.platform, 'darwin', 'Run native archive verification on macOS');
assert(/^\d+\.\d+\.\d+$/.test(pkg.version), 'Expected a stable release version');
const names = ['arm64', 'x64'].flatMap(arch => ['dmg', 'zip'].map(ext => `vxchat_${pkg.version}_macos_${arch}.${ext}`));
const manifest = yaml.load(fs.readFileSync(path.join(dist, 'latest-mac.yml'), 'utf8'));
assert.equal(manifest.version, pkg.version);
assert.deepEqual(manifest.files.map(file => file.url).sort(), [...names].sort());
for (const file of manifest.files) {
  const local = path.join(dist, file.url);
  assert.equal(fs.statSync(local).size, file.size, `Size: ${file.url}`);
  assert.equal(hash(local, 'sha512'), file.sha512, `Feed SHA512: ${file.url}`);
}
assert(names.includes(manifest.path) && manifest.path.endsWith('.zip'));
assert.equal(manifest.sha512, manifest.files.find(file => file.url === manifest.path).sha512);
const source = walk(path.join(root, 'src')).sort();
const results = [];
for (const arch of ['arm64', 'x64']) {
  const name = `vxchat_${pkg.version}_macos_${arch}.zip`;
  execFileSync(process.execPath, [path.join(__dirname, 'verify_release_assets.js'), path.join(dist, name), arch], { stdio: 'inherit' });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_preflight_'));
  try {
    execFileSync('ditto', ['-x', '-k', path.join(dist, name), scratch]);
    const archive = path.join(scratch, 'VXChat.app/Contents/Resources/app.asar');
    const entries = asar.listPackage(archive);
    const packagedSource = entries.filter(entry => entry.startsWith('/src/') && !asar.statFile(archive, entry.slice(1)).files).map(entry => entry.slice(1)).sort();
    assert.deepEqual(packagedSource, source, `Packaged source inventory: ${arch}`);
    for (const file of source) assert(asar.extractFile(archive, file).equals(fs.readFileSync(path.join(root, file))), `Stale source: ${arch}/${file}`);
    const packaged = JSON.parse(asar.extractFile(archive, 'package.json'));
    // Builder intentionally strips scripts/devDependencies from packaged metadata.
    for (const key of ['name', 'productName', 'version', 'main', 'dependencies', 'repository']) assert.deepEqual(packaged[key], pkg[key], `Packaged metadata: ${arch}/${key}`);
    const mountpoint = path.join(scratch, 'mounted_dmg');
    fs.mkdirSync(mountpoint);
    let mounted = false;
    try {
      execFileSync('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mountpoint, path.join(dist, `vxchat_${pkg.version}_macos_${arch}.dmg`)], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
      mounted = true;
      assert.deepEqual(bundleTree(path.join(mountpoint, 'VXChat.app')), bundleTree(path.join(scratch, 'VXChat.app')), `DMG app differs from verified ZIP: ${arch}`);
    } finally {
      if (mounted) execFileSync('hdiutil', ['detach', mountpoint], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
    }
    results.push({ architecture: arch, source_matches: true, archive_gate: 'PASS', dmg_matches_verified_zip: true });
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ result: 'PASS', version: pkg.version, zip_checks: results, manifest_hashes: true, assets: [...names, 'latest-mac.yml', ...names.map(name => `${name}.blockmap`)].map(name => { const file = path.join(dist, name); assert(fs.statSync(file).isFile()); return { name, size: fs.statSync(file).size, sha256: hash(file, 'sha256') }; }), dmg_contents_verified: true, public_verified: false, installed: false }, null, 2));
