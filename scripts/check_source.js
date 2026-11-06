'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
for (const file of [...files('src'), ...files('scripts'), ...files('tests')].filter(f => f.endsWith('.js'))) execFileSync(process.execPath, ['--check', file]);
const active = files('src').map(file => fs.readFileSync(file, 'utf8')).join('\n');
for (const forbidden of ['messNotificationBridge', 'chat_bubble.css', 'notification_observer.js', 'navigator.userAgent', 'clearStorageData(', 'clearCache(']) {
  if (active.includes(forbidden)) throw new Error(`legacy_behavior_in_active_runtime: ${forbidden}`);
}
if (require('../package.json').main !== 'src/main/app.js') throw new Error('incorrect_engine_entry');
console.log('Active JS syntax, engine entry and legacy/theme separation PASS.');

const { createHash } = require('node:crypto');
const shared = 'src/shell/shared';
const manifest = JSON.parse(fs.readFileSync(path.join(shared, 'manifest.json'), 'utf8'));
for (const [name, hash] of Object.entries(manifest.files)) if (createHash('sha256').update(fs.readFileSync(path.join(shared, name))).digest('hex') !== hash) throw new Error(`settings_vendor_drift: ${name}`);
console.log('Settings shared component hashes PASS.');

const titlebarManifest = JSON.parse(fs.readFileSync(path.join(shared, 'titlebar_manifest.json'), 'utf8'));
for (const [name, hash] of Object.entries(titlebarManifest.files)) if (createHash('sha256').update(fs.readFileSync(path.join(shared, name))).digest('hex') !== hash) throw new Error(`titlebar_vendor_drift: ${name}`);
console.log('Titlebar shared token hashes PASS.');
