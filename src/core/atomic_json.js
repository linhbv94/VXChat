'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const MAX_BYTES = 256 * 1024;

function readJSON(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('configuration_not_regular_file');
  if (stat.size > MAX_BYTES) throw new Error('configuration_too_large');
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text);
}
function fingerprint(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function writeJSON(file, value) {
  const encoded = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(encoded) > MAX_BYTES) throw new Error('configuration_too_large');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('configuration_not_regular_file'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${file}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, encoded); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function backupAndReset(file, expectedFingerprint, value) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || !expectedFingerprint || fingerprint(file) !== expectedFingerprint) throw new Error('configuration_changed');
  const backup = `${file}.recovery_${randomUUID()}.json`;
  fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  writeJSON(file, value);
  return backup;
}
module.exports = { readJSON, writeJSON, fingerprint, backupAndReset, MAX_BYTES };
