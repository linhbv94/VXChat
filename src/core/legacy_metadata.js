'use strict';

const { randomUUID } = require('node:crypto');
const { service, defaultInstances } = require('./services');
const { validateState } = require('./state_store');

// Explicit, metadata-only conversion. Never read/import WebKit or Chromium profiles.
function convertSwiftTabs(raw) {
  if (!raw || !Array.isArray(raw.tabs) || (raw.activeTabID !== null && raw.activeTabID !== undefined && typeof raw.activeTabID !== 'string')) throw new Error('invalid_legacy_state');
  const instances = defaultInstances(); const tabs = []; const oldToNew = new Map();
  for (const old of raw.tabs) {
    if (!old || typeof old.id !== 'string' || oldToNew.has(old.id)) throw new Error('invalid_legacy_tab');
    const definition = service(old.serviceID);
    const instance = instances.find(i => i.service_id === old.serviceID);
    if (!definition.multiTab && tabs.some(t => t.instance_id === instance.id)) throw new Error('duplicate_legacy_non_ai');
    const id = randomUUID(); oldToNew.set(old.id, id);
    const label = typeof old.label === 'string' ? old.label : definition.label;
    tabs.push({ id, instance_id: instance.id, label });
    // entryURL, generation, current thread routes and unknown fields are discarded.
  }
  const active = raw.activeTabID == null ? tabs[0]?.id || null : oldToNew.get(raw.activeTabID);
  if (active === undefined) throw new Error('invalid_legacy_active');
  return validateState({ schema_version: 2, instances, tabs, active_tab_id: active });
}
module.exports = { convertSwiftTabs };
