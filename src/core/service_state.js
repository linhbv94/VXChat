'use strict';
const { readJSON, writeJSON } = require('./atomic_json');
const { defaultInstances, service, httpsURL } = require('./services');
const { routeStage } = require('./workflow');
function initialServiceState() {
  return { schema_version: 1, entries: defaultInstances().map(i => ({ instance_id: i.id, setup_confirmed: false, workspace_id: null })) };
}
function validateServiceState(value) {
  const expected = defaultInstances();
  if (!value || Object.keys(value).sort().join() !== 'entries,schema_version' || value.schema_version !== 1 || !Array.isArray(value.entries)) throw new Error('invalid_service_state');
  for (const def of expected) {
    if (!value.entries.some(e => e?.instance_id === def.id)) throw new Error('missing_default_entry');
  }
  const seen = new Set();
  for (const e of value.entries) {
    if (!e || Object.keys(e).sort().join() !== 'instance_id,setup_confirmed,workspace_id' || seen.has(e.instance_id) || typeof e.setup_confirmed !== 'boolean' || typeof e.instance_id !== 'string') throw new Error('invalid_service_state');
    const isSlack = e.instance_id === 'default_slack' || e.instance_id.startsWith('instance_slack_');
    const isMessenger = e.instance_id === 'default_messenger' || e.instance_id.startsWith('instance_messenger_');
    if (!isMessenger && e.setup_confirmed) throw new Error('invalid_service_state');
    if (e.workspace_id !== null && (!isSlack || !/^T[A-Z0-9]{1,79}$/.test(e.workspace_id))) throw new Error('invalid_service_state');
    seen.add(e.instance_id);
  }
  return value;
}
function workspaceID(value) {
  const url = httpsURL(value);
  if (!url || url.hostname !== 'app.slack.com' || url.port) return null;
  return /^\/client\/(T[A-Z0-9]{1,79})(?:\/|$)/.exec(url.pathname)?.[1] || null;
}
function migrateServiceState(value) {
  const expected = defaultInstances();
  if (value?.schema_version === 1 && Array.isArray(value.entries) && value.entries.length > 0 && value.entries.length < expected.length) {
    const ids = new Set(value.entries.map(e => e?.instance_id));
    if (ids.size === value.entries.length && value.entries.every(e => expected.some(i => i.id === e?.instance_id))) {
      return { ...value, entries: [...value.entries, ...expected.filter(i => !ids.has(i.id)).map(i => ({ instance_id: i.id, setup_confirmed: false, workspace_id: null }))] };
    }
  }
  return value;
}
class ServiceState {
  constructor(file = null) {
    this.file = file;
    try { this.value = file ? validateServiceState(migrateServiceState(readJSON(file))) : initialServiceState(); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('service_state_recovery_required', { cause: error }); this.value = initialServiceState(); }
  }
  entry(id) {
    const value = this.value.entries.find(e => e.instance_id === id);
    if (!value) {
      if (typeof id === 'string' && id.startsWith('instance_')) {
        return { instance_id: id, setup_confirmed: false, workspace_id: null };
      }
      throw new Error('unknown_instance');
    }
    return { ...value };
  }
  update(id, patch) {
    const existing = this.value.entries.find(e => e.instance_id === id);
    const old = existing ? { ...existing } : { instance_id: id, setup_confirmed: false, workspace_id: null };
    const next = { ...old, ...patch };
    if (existing && JSON.stringify(old) === JSON.stringify(next)) return old;
    const entries = existing
      ? this.value.entries.map(e => e.instance_id === id ? next : e)
      : [...this.value.entries, next];
    const state = validateServiceState({ schema_version: 1, entries });
    if (this.file) writeJSON(this.file, state);
    this.value = state;
    return { ...next };
  }
  confirm(instance) { if (instance.service_id !== 'messenger') throw new Error('invalid_setup'); return this.update(instance.id, { setup_confirmed: true }); }
  resetSetup(instance) { if (instance.service_id !== 'messenger') throw new Error('invalid_setup'); return this.update(instance.id, { setup_confirmed: false }); }
  observe(instance, url) {
    if (instance.service_id === 'slack') { const id = workspaceID(url); if (id) this.update(instance.id, { workspace_id: id }); }
    // A feed/notification navigation is not evidence of session expiry.
    if (instance.service_id === 'messenger' && routeStage('messenger', url) === 'auth') this.resetSetup(instance);
  }
  startURL(instance, explicitSlack = null) {
    const state = this.entry(instance.id);
    if (instance.service_id === 'messenger' && !state.setup_confirmed) return 'https://www.facebook.com/';
    if (instance.service_id === 'slack') return explicitSlack || (state.workspace_id ? `https://app.slack.com/client/${state.workspace_id}` : 'https://app.slack.com/client');
    return service(instance.service_id).url;
  }
}
module.exports = { ServiceState, initialServiceState, validateServiceState, workspaceID };
