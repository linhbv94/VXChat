'use strict';

const { randomUUID } = require('node:crypto');
const { service, defaultInstances } = require('./services');
const { readJSON, writeJSON, MAX_BYTES } = require('./atomic_json');

function exactKeys(object, keys) {
  return object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).sort().join() === keys.slice().sort().join();
}
function validID(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value); }
function validLabel(value) { return typeof value === 'string' && value.length > 0 && value.length <= 64 && !/[\x00-\x1f\x7f]/.test(value); }
function validateState(state) {
  if (!exactKeys(state, ['schema_version', 'instances', 'tabs', 'active_tab_id']) || state.schema_version !== 2 || !Array.isArray(state.instances) || !Array.isArray(state.tabs)) throw new Error('invalid_state');
  const expected = defaultInstances();
  if (state.instances.length !== expected.length) throw new Error('invalid_instances');
  for (const instance of state.instances) {
    const canonical = expected.find(i => i.id === instance.id);
    if (!canonical || !exactKeys(instance, ['id', 'service_id', 'label', 'partition']) || !validLabel(instance.label) || canonical.service_id !== instance.service_id || canonical.partition !== instance.partition) throw new Error('invalid_instance');
  }
  if (new Set(state.instances.map(i => i.id)).size !== expected.length) throw new Error('duplicate_instance');
  const ids = new Set();
  const count = new Map();
  for (const tab of state.tabs) {
    if (!exactKeys(tab, ['id', 'instance_id', 'label']) || !validID(tab.id) || ids.has(tab.id) || !validLabel(tab.label)) throw new Error('invalid_tab');
    ids.add(tab.id);
    const instance = state.instances.find(i => i.id === tab.instance_id);
    if (!instance) throw new Error('unknown_instance');
    count.set(instance.id, (count.get(instance.id) || 0) + 1);
    if (!service(instance.service_id).multiTab && count.get(instance.id) > 1) throw new Error('duplicate_non_ai');
  }
  if (state.tabs.length ? !ids.has(state.active_tab_id) : state.active_tab_id !== null) throw new Error('invalid_active_tab');
  if (Buffer.byteLength(JSON.stringify(state)) > MAX_BYTES) throw new Error('state_too_large');
  return state;
}
function initialState() {
  const instances = defaultInstances();
  const tabs = instances.map(i => ({ id: randomUUID(), instance_id: i.id, label: i.label }));
  return { schema_version: 2, instances, tabs, active_tab_id: tabs[0].id };
}
class StateStore {
  constructor(file) { this.file = file; }
  load() {
    try {
      return validateState(readJSON(this.file));
    } catch (error) {
      if (error.code === 'ENOENT') { this.needsInitialSave = true; return initialState(); }
      throw new Error('state_recovery_required', { cause: error });
    }
  }
  save(state) {
    validateState(state);
    writeJSON(this.file, state);
  }
}
module.exports = { StateStore, validateState, initialState };
