'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { convertSwiftTabs } = require('../src/core/legacy_metadata');
const { StateStore } = require('../src/core/state_store');
const [input, output] = process.argv.slice(2);
try {
  if (!input || !output || process.argv.length !== 4) throw new Error('usage');
  if (path.resolve(input) === path.resolve(output) || fs.existsSync(output)) throw new Error('output_exists');
  if (fs.statSync(input).size > 256 * 1024) throw new Error('oversized_input');
  const converted = convertSwiftTabs(JSON.parse(fs.readFileSync(input, 'utf8')));
  new StateStore(output).save(converted);
  console.log(`Imported ${converted.tabs.length} tab metadata entries. No authentication/session data imported.`);
} catch {
  console.error('Import failed; original file and existing output preserved. Usage: node scripts/import_legacy_tabs.js input.json new_output.json');
  process.exitCode = 1;
}
