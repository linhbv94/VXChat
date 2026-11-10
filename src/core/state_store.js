'use strict';

const { randomUUID } = require('node:crypto');
const { service, SERVICES, defaultInstances } = require('./services');
const { readJSON, writeJSON, MAX_BYTES } = require('./atomic_json');

function exactKeys(object, keys) {
  return object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).sort().join() === keys.slice().sort().join();
}
function validID(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value); }
function validLabel(value) { return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\x00-\x1f\x7f]/.test(value); }
function validateState(state) {
  if (!exactKeys(state, ['schema_version', 'instances', 'tabs', 'active_tab_id']) || state.schema_version !== 2 || !Array.isArray(state.instances) || !Array.isArray(state.tabs)) throw new Error('invalid_state');
  const expected = defaultInstances();
  if (state.instances.length < expected.length) throw new Error('invalid_instances');
  for (const def of expected) {
    const canonical = state.instances.find(i => i.id === def.id);
    if (!canonical || canonical.service_id !== def.service_id || canonical.partition !== def.partition) throw new Error('missing_default_instance');
  }
  for (const instance of state.instances) {
    if (!instance || typeof instance !== 'object' || Array.isArray(instance)) throw new Error('invalid_instance');
    let def;
    try { def = service(instance.service_id); } catch { throw new Error('invalid_instance'); }
    if (!validID(instance.id) || !validID(instance.service_id) || !def || !validLabel(instance.label)) throw new Error('invalid_instance');
    if (typeof instance.partition !== 'string' || !instance.partition.startsWith('persist:service-')) throw new Error('invalid_instance');
    const isGoogle = ['gmail', 'gemini', 'meet'].includes(instance.service_id);
    if (isGoogle) {
      if (instance.id === `default_${instance.service_id}`) {
        if (instance.partition !== 'persist:service-google') throw new Error('invalid_instance');
      } else {
        if (!instance.partition.startsWith('persist:service-google-')) throw new Error('invalid_instance');
      }
    } else {
      if (instance.id === `default_${instance.service_id}`) {
        if (instance.partition !== `persist:service-${instance.service_id}`) throw new Error('invalid_instance');
      } else {
        if (!instance.partition.startsWith(`persist:service-${instance.service_id}-`)) throw new Error('invalid_instance');
      }
    }
    if (instance.profile_id !== undefined && !validID(instance.profile_id)) throw new Error('invalid_profile_id');
    if (instance.profile_label !== undefined && !validLabel(instance.profile_label)) throw new Error('invalid_profile_label');
    if (instance.profile_color !== undefined && typeof instance.profile_color !== 'string') throw new Error('invalid_profile_color');
  }
  if (new Set(state.instances.map(i => i.id)).size !== state.instances.length) throw new Error('duplicate_instance');
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
function migrateState(state) {
  const expected = defaultInstances();
  if (state?.schema_version === 2 && Array.isArray(state.instances)) {
    const validInstances = state.instances.filter(i => {
      if (!i || typeof i !== 'object') return false;
      if (typeof i.service_id === 'string' && i.service_id.startsWith('custom_')) {
        try { return !!service(i.service_id); } catch { return false; }
      }
      return true;
    });
    const validInstanceIds = new Set(validInstances.map(i => i.id));
    const validTabs = (Array.isArray(state.tabs) ? state.tabs : []).filter(t => t && validInstanceIds.has(t.instance_id));
    let activeTabId = state.active_tab_id;
    if (!validTabs.some(t => t.id === activeTabId)) {
      activeTabId = validTabs[0]?.id || null;
    }
    const ids = new Set(validInstances.map(i => i?.id));
    const missing = expected.filter(e => !ids.has(e.id));
    return {
      ...state,
      instances: [...validInstances, ...missing],
      tabs: validTabs,
      active_tab_id: activeTabId
    };
  }
  return state;
}
class StateStore {
  constructor(file) { this.file = file; }
  load() {
    try {
      const raw = readJSON(this.file);
      const migrated = migrateState(raw);
      const validated = validateState(migrated);
      if (JSON.stringify(raw) !== JSON.stringify(validated)) writeJSON(this.file, validated);
      return validated;
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
module.exports = { StateStore, validateState, migrateState, initialState };
