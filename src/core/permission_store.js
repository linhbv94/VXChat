'use strict';
const { createHash } = require('node:crypto');
const { readJSON, writeJSON } = require('./atomic_json');
const { defaultInstances, service, httpsURL, externalWebURL, hostMatches } = require('./services');
const KEYS = ['notifications', 'media:audio', 'media:video', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'speaker-selection'];
function permissionID(entry) { return createHash('sha256').update(`${entry.instance_id}|${entry.origin}|${entry.permission}`).digest('hex'); }
function resolveServiceId(instanceId) {
  if (typeof instanceId !== 'string') return null;
  if (instanceId.startsWith('default_')) {
    const candidate = instanceId.slice('default_'.length);
    if (/^(messenger|zalo|slack|chatgpt|gmail|gemini|meet|telegram|whatsapp|discord|custom_[a-f0-9]{32})$/.test(candidate)) {
      return candidate;
    }
  }
  const match = /^instance_(messenger|zalo|slack|chatgpt|gmail|gemini|meet|telegram|whatsapp|discord|custom_[a-f0-9]{32})_profile_[a-zA-Z0-9_-]{1,64}$/.exec(instanceId);
  if (match) {
    return match[1];
  }
  return null;
}
function sanitizePermissions(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.entries)) return data;
  const filtered = data.entries.filter(entry => {
    if (!entry || typeof entry !== 'object') return true;
    const sId = resolveServiceId(entry.instance_id);
    if (typeof sId === 'string' && sId.startsWith('custom_')) {
      try { return !!service(sId); } catch { return false; }
    }
    return true;
  });
  return { ...data, entries: filtered };
}
function validatePermissions(value) {
  if (!value || Object.keys(value).sort().join() !== 'entries,schema_version' || value.schema_version !== 1 || !Array.isArray(value.entries) || value.entries.length > 512) throw new Error('invalid_permissions');
  const ids = new Set();
  for (const entry of value.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('invalid_permissions');
    const serviceId = resolveServiceId(entry.instance_id);
    const url = externalWebURL(entry.origin);
    let svc = null;
    try { if (serviceId) svc = service(serviceId); } catch {}
    if (!entry || Object.keys(entry).sort().join() !== 'decision,instance_id,origin,permission' || !svc || !url || url.origin !== entry.origin || !svc.hosts.some(h => hostMatches(url.hostname, h)) || !KEYS.includes(entry.permission) || !['allow', 'deny'].includes(entry.decision)) throw new Error('invalid_permissions');
    const id = permissionID(entry); if (ids.has(id)) throw new Error('duplicate_permission'); ids.add(id);
  }
  return value;
}
class PermissionStore {
  constructor(file = null) {
    this.file = file;
    try {
      if (!file) {
        this.value = { schema_version: 1, entries: [] };
      } else {
        const raw = readJSON(file);
        const sanitized = sanitizePermissions(raw);
        const validated = validatePermissions(sanitized);
        if (sanitized.entries.length !== raw.entries?.length) writeJSON(file, validated);
        this.value = validated;
      }
    }
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
  deleteScope(serviceId) {
    if (!serviceId) return;
    const entries = this.value.entries.filter(entry => {
      const sId = resolveServiceId(entry.instance_id);
      if (sId === serviceId) return false;
      if (entry.instance_id === `default_${serviceId}`) return false;
      if (entry.instance_id.startsWith(`instance_${serviceId}_`)) return false;
      return true;
    });
    if (entries.length === this.value.entries.length) return;
    const next = { schema_version: 1, entries };
    if (this.file) writeJSON(this.file, next);
    this.value = next;
  }
}
module.exports = { PermissionStore, validatePermissions, permissionID };
