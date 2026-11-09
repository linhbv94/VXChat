'use strict';
const { readJSON, writeJSON } = require('./atomic_json');
const { normalizeSlackWorkspace, defaultInstances, SERVICES } = require('./services');
const path = require('node:path');
const DEFAULTS = Object.freeze({ schema_version: 3, theme: 'system', language: 'vi', slack_workspace_url: null, zoom_levels: Object.freeze({}), download_directory: null, ask_download_location: true, service_order: Object.freeze(Object.keys(SERVICES)), hidden_services: Object.freeze([]) });
function migratePreferences(value) {
  if (value?.schema_version === 1) {
    if (Object.keys(value).sort().join() !== 'language,schema_version,slack_workspace_url,theme') throw new Error('invalid_preferences');
    return { ...DEFAULTS, ...value, schema_version:3, zoom_levels:{} };
  }
  if (value?.schema_version === 2) {
    const keys = Object.keys(DEFAULTS).filter(k => !['service_order','hidden_services'].includes(k));
    if (Object.keys(value).sort().join() !== keys.sort().join()) throw new Error('invalid_preferences');
    return { ...DEFAULTS, ...value, schema_version:3 };
  }
  const services = Object.keys(SERVICES);
  if (value?.schema_version === 3 && Array.isArray(value.service_order) && value.service_order.length > 0 && value.service_order.length < services.length && new Set(value.service_order).size === value.service_order.length && value.service_order.every(id => services.includes(id))) {
    return { ...value, service_order: [...value.service_order, ...services.filter(id => !value.service_order.includes(id))] };
  }
  return value;
}
const THEMES = ['system', 'dark', 'light', 'black'];
function validatePreferences(value) {
  if (!value || Object.keys(value).sort().join() !== Object.keys(DEFAULTS).sort().join() || value.schema_version !== 3 || !THEMES.includes(value.theme) || !['vi', 'en'].includes(value.language)) throw new Error('invalid_preferences');
  const services = Object.keys(SERVICES);
  if (!Array.isArray(value.service_order) || value.service_order.length !== services.length || new Set(value.service_order).size !== services.length || value.service_order.some(id => !services.includes(id)) || !Array.isArray(value.hidden_services) || new Set(value.hidden_services).size !== value.hidden_services.length || value.hidden_services.some(id => !services.includes(id))) throw new Error('invalid_preferences');
  if (typeof value.ask_download_location !== 'boolean' || (value.download_directory !== null && (typeof value.download_directory !== 'string' || value.download_directory.length > 4096 || !path.isAbsolute(value.download_directory)))) throw new Error('invalid_preferences');
  const ids = new Set(defaultInstances().map(i => i.id));
  const validZoomInstance = id => ids.has(id) || /^instance_(?:messenger|zalo|slack|chatgpt|gmail|gemini|meet)_profile_[a-zA-Z0-9_-]{1,64}$/.test(id);
  if (!value.zoom_levels || typeof value.zoom_levels !== 'object' || Array.isArray(value.zoom_levels) || Object.entries(value.zoom_levels).some(([id,n]) => !validZoomInstance(id) || !Number.isFinite(n) || n < 0.5 || n > 2)) throw new Error('invalid_preferences');
  if (value.slack_workspace_url !== null && normalizeSlackWorkspace(value.slack_workspace_url) !== value.slack_workspace_url) throw new Error('invalid_workspace_url');
  return value;
}
class PreferencesStore {
  constructor(file) {
    this.file = file; this.persisted = true;
    try { this.value = validatePreferences(migratePreferences(readJSON(file))); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('preferences_recovery_required', { cause: error });
      this.value = { ...DEFAULTS }; this.persisted = false;
    }
  }
  snapshot() { return { ...this.value, zoom_levels: { ...this.value.zoom_levels }, service_order: [...this.value.service_order], hidden_services: [...this.value.hidden_services] }; }
  update(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(k => !['theme', 'language', 'slack_workspace_url', 'zoom_levels', 'download_directory', 'ask_download_location','service_order','hidden_services'].includes(k))) throw new Error('invalid_preferences');
    const next = { ...this.value, ...patch };
    if (Object.hasOwn(patch, 'slack_workspace_url')) next.slack_workspace_url = normalizeSlackWorkspace(patch.slack_workspace_url);
    validatePreferences(next); writeJSON(this.file, next);
    this.value = { ...next, zoom_levels: { ...next.zoom_levels },service_order:[...next.service_order],hidden_services:[...next.hidden_services] }; this.persisted = true; return this.snapshot();
  }
  migrate(legacy) {
    if (this.persisted) return this.snapshot();
    const patch = {};
    if (THEMES.includes(legacy?.theme)) patch.theme = legacy.theme;
    if (['vi', 'en'].includes(legacy?.language)) patch.language = legacy.language;
    return this.update(patch);
  }
  reset() { const { schema_version: _schema, ...defaults } = DEFAULTS; return this.update({ ...defaults, language: this.value.language }); }
}
module.exports = { PreferencesStore, validatePreferences, migratePreferences, DEFAULTS, THEMES };
