'use strict';
const { readJSON, writeJSON } = require('./atomic_json');
const { normalizeSlackWorkspace, defaultInstances } = require('./services');
const path = require('node:path');
const DEFAULTS = Object.freeze({ schema_version: 2, theme: 'system', language: 'vi', slack_workspace_url: null, zoom_levels: Object.freeze({}), download_directory: null, ask_download_location: true });
function migratePreferences(value) {
  if (value?.schema_version !== 1) return value;
  if (Object.keys(value).sort().join() !== 'language,schema_version,slack_workspace_url,theme') throw new Error('invalid_preferences');
  return { ...DEFAULTS, ...value, schema_version:2, zoom_levels:{} };
}
const THEMES = ['system', 'dark', 'light', 'black'];
function validatePreferences(value) {
  if (!value || Object.keys(value).sort().join() !== Object.keys(DEFAULTS).sort().join() || value.schema_version !== 2 || !THEMES.includes(value.theme) || !['vi', 'en'].includes(value.language)) throw new Error('invalid_preferences');
  if (typeof value.ask_download_location !== 'boolean' || (value.download_directory !== null && (typeof value.download_directory !== 'string' || value.download_directory.length > 4096 || !path.isAbsolute(value.download_directory)))) throw new Error('invalid_preferences');
  const ids = defaultInstances().map(i => i.id);
  if (!value.zoom_levels || typeof value.zoom_levels !== 'object' || Array.isArray(value.zoom_levels) || Object.entries(value.zoom_levels).some(([id,n]) => !ids.includes(id) || !Number.isFinite(n) || n < 0.5 || n > 2)) throw new Error('invalid_preferences');
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
  snapshot() { return { ...this.value, zoom_levels: { ...this.value.zoom_levels } }; }
  update(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(k => !['theme', 'language', 'slack_workspace_url', 'zoom_levels', 'download_directory', 'ask_download_location'].includes(k))) throw new Error('invalid_preferences');
    const next = { ...this.value, ...patch };
    if (Object.hasOwn(patch, 'slack_workspace_url')) next.slack_workspace_url = normalizeSlackWorkspace(patch.slack_workspace_url);
    validatePreferences(next); writeJSON(this.file, next);
    this.value = { ...next, zoom_levels: { ...next.zoom_levels } }; this.persisted = true; return this.snapshot();
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
