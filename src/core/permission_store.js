'use strict';
const { createHash } = require('node:crypto');
const { readJSON, writeJSON } = require('./atomic_json');
const { defaultInstances, service, httpsURL, hostMatches } = require('./services');
const KEYS = ['notifications', 'media:audio', 'media:video', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'speaker-selection'];
function permissionID(entry) { return createHash('sha256').update(`${entry.instance_id}|${entry.origin}|${entry.permission}`).digest('hex'); }
function validatePermissions(value) {
  if (!value || Object.keys(value).sort().join() !== 'entries,schema_version' || value.schema_version !== 1 || !Array.isArray(value.entries) || value.entries.length > 512) throw new Error('invalid_permissions');
  const ids = new Set();
  for (const entry of value.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('invalid_permissions');
    const instance = defaultInstances().find(i => i.id === entry.instance_id); const url = httpsURL(entry.origin);
    if (!entry || Object.keys(entry).sort().join() !== 'decision,instance_id,origin,permission' || !instance || !url || url.origin !== entry.origin || !service(instance.service_id).hosts.some(h => hostMatches(url.hostname, h)) || !KEYS.includes(entry.permission) || !['allow', 'deny'].includes(entry.decision)) throw new Error('invalid_permissions');
    const id = permissionID(entry); if (ids.has(id)) throw new Error('duplicate_permission'); ids.add(id);
  }
  return value;
}
class PermissionStore {
  constructor(file = null) {
    this.file = file;
    try { this.value = file ? validatePermissions(readJSON(file)) : { schema_version: 1, entries: [] }; }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('permissions_recovery_required', { cause: error }); this.value = { schema_version: 1, entries: [] }; }
  }
  decision(instanceID, origin, permission) { return this.value.entries.find(e => e.instance_id === instanceID && e.origin === origin && e.permission === permission)?.decision; }
  set(instanceID, origin, permissions, decision) {
    const entries = this.value.entries.filter(e => !(e.instance_id === instanceID && e.origin === origin && permissions.includes(e.permission)));
    for (const permission of permissions) entries.push({ instance_id: instanceID, origin, permission, decision });
    const next = validatePermissions({ schema_version: 1, entries }); if (this.file) writeJSON(this.file, next); this.value = next;
  }
  snapshot() { return this.value.entries.map(entry => ({ ...entry, id: permissionID(entry) })); }
  revoke(id) {
    if (!this.value.entries.some(entry => permissionID(entry) === id)) throw new Error('permission_not_found');
    const next = { schema_version: 1, entries: this.value.entries.filter(entry => permissionID(entry) !== id) };
    if (this.file) writeJSON(this.file, next); this.value = next;
  }
}
module.exports = { PermissionStore, validatePermissions, permissionID };
