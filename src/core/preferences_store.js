'use strict';
const { readJSON, writeJSON } = require('./atomic_json');
const { normalizeSlackWorkspace, defaultInstances, SERVICES, registerCustomService, clearCustomServices } = require('./services');
const path = require('node:path');

const PRESET_CUSTOM_ICONS = Object.freeze([
  'zcall', 'zchat', 'zcode', 'zdoc', 'zgame', 'zmail', 'zmap', 'zmeet',
  'zmovie', 'zmusic', 'znews', 'zphoto', 'zshop', 'ztask', 'ztool', 'zweb'
]);

const DEFAULTS = Object.freeze({
  schema_version: 4,
  theme: 'system',
  language: 'vi',
  slack_workspace_url: null,
  zoom_levels: Object.freeze({}),
  download_directory: null,
  ask_download_location: true,
  service_order: Object.freeze(Object.keys(SERVICES)),
  hidden_services: Object.freeze([]),
  custom_services: Object.freeze([])
});

function validateCustomService(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('invalid_preferences');
  if (typeof item.id !== 'string' || !/^custom_[a-f0-9]{32}$/.test(item.id)) throw new Error('invalid_preferences');
  if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 32 || /[\x00-\x1f\x7f]/.test(item.label)) throw new Error('invalid_preferences');
  if (typeof item.service_url !== 'string' || item.service_url.length > 8192) throw new Error('invalid_preferences');
  try {
    const u = new URL(item.service_url);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('invalid_preferences');
  } catch { throw new Error('invalid_preferences'); }
  if (item.login_url !== null && item.login_url !== undefined) {
    if (typeof item.login_url !== 'string' || item.login_url.length > 8192) throw new Error('invalid_preferences');
    if (item.login_url.trim()) {
      try {
        const lu = new URL(item.login_url);
        if (!['http:', 'https:'].includes(lu.protocol) || lu.username || lu.password) throw new Error('invalid_preferences');
      } catch { throw new Error('invalid_preferences'); }
    }
  }
  if (typeof item.icon_key !== 'string' || !PRESET_CUSTOM_ICONS.includes(item.icon_key)) throw new Error('invalid_preferences');
  if (typeof item.created_at !== 'number' || !Number.isFinite(item.created_at)) throw new Error('invalid_preferences');
  return true;
}

function migratePreferences(value) {
  if (value?.schema_version === 1) {
    if (Object.keys(value).sort().join() !== 'language,schema_version,slack_workspace_url,theme') throw new Error('invalid_preferences');
    return { ...DEFAULTS, ...value, schema_version: 4, zoom_levels: {}, custom_services: [] };
  }
  if (value?.schema_version === 2) {
    const expected = Object.keys(DEFAULTS).filter(k => !['service_order', 'hidden_services', 'custom_services'].includes(k)).sort().join();
    const actual = Object.keys(value).filter(k => k !== 'custom_services').sort().join();
    if (actual !== expected) throw new Error('invalid_preferences');
    const { custom_services, ...rest } = value;
    return { ...DEFAULTS, ...rest, schema_version: 4, custom_services: [] };
  }
  const services = Object.keys(SERVICES);
  if (value?.schema_version === 3) {
    const custom = Array.isArray(value.custom_services)
      ? value.custom_services.filter(c => { try { return validateCustomService(c); } catch { return false; } })
      : [];
    const customIds = new Set(custom.map(c => c.id));
    let order = [];
    if (Array.isArray(value.service_order)) {
      for (const id of value.service_order) {
        if ((services.includes(id) || customIds.has(id)) && !order.includes(id)) {
          order.push(id);
        }
      }
    }
    for (const id of services) {
      if (!order.includes(id)) order.push(id);
    }
    for (const c of custom) {
      if (!order.includes(c.id)) order.push(c.id);
    }
    const hidden = Array.isArray(value.hidden_services)
      ? value.hidden_services.filter(id => order.includes(id))
      : [];
    return {
      ...DEFAULTS,
      ...value,
      schema_version: 4,
      service_order: order,
      hidden_services: [...new Set(hidden)],
      custom_services: custom
    };
  }
  if (value?.schema_version >= 4) {
    const custom = Array.isArray(value.custom_services)
      ? value.custom_services.filter(c => { try { return validateCustomService(c); } catch { return false; } })
      : [];
    const customIds = new Set(custom.map(c => c.id));
    let order = [];
    if (Array.isArray(value.service_order)) {
      for (const id of value.service_order) {
        if ((services.includes(id) || customIds.has(id)) && !order.includes(id)) {
          order.push(id);
        }
      }
    }
    for (const id of services) {
      if (!order.includes(id)) order.push(id);
    }
    for (const c of custom) {
      if (!order.includes(c.id)) order.push(c.id);
    }
    const hidden = Array.isArray(value.hidden_services)
      ? value.hidden_services.filter(id => order.includes(id))
      : [];
    const uniqueHidden = [...new Set(hidden)];
    const theme = THEMES.includes(value.theme) ? value.theme : DEFAULTS.theme;
    const language = ['vi', 'en'].includes(value.language) ? value.language : DEFAULTS.language;
    const askDownload = typeof value.ask_download_location === 'boolean' ? value.ask_download_location : DEFAULTS.ask_download_location;
    const downloadDir = (typeof value.download_directory === 'string' && value.download_directory.length <= 4096 && path.isAbsolute(value.download_directory))
      ? value.download_directory
      : null;
    let slackUrl = null;
    if (typeof value.slack_workspace_url === 'string') {
      try { slackUrl = normalizeSlackWorkspace(value.slack_workspace_url); } catch {}
    }
    const ids = new Set(defaultInstances().map(i => i.id));
    const validZoomInstance = id => ids.has(id) || customIds.has(id) || /^default_custom_[a-f0-9]{32}$/.test(id) || /^instance_(?:messenger|zalo|slack|chatgpt|gmail|gemini|meet|telegram|whatsapp|discord|custom_[a-f0-9]{32})_profile_[a-zA-Z0-9_-]{1,64}$/.test(id);
    const zoom = {};
    if (value.zoom_levels && typeof value.zoom_levels === 'object' && !Array.isArray(value.zoom_levels)) {
      for (const [k, v] of Object.entries(value.zoom_levels)) {
        if (validZoomInstance(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0.5 && v <= 2) {
          zoom[k] = v;
        }
      }
    }
    return {
      schema_version: 4,
      theme,
      language,
      slack_workspace_url: slackUrl,
      zoom_levels: zoom,
      download_directory: downloadDir,
      ask_download_location: askDownload,
      service_order: order,
      hidden_services: uniqueHidden,
      custom_services: custom
    };
  }
  return value;
}

const THEMES = ['system', 'dark', 'light', 'black'];

function validatePreferences(value) {
  if (!value || Object.keys(value).sort().join() !== Object.keys(DEFAULTS).sort().join() || value.schema_version !== 4 || !THEMES.includes(value.theme) || !['vi', 'en'].includes(value.language)) throw new Error('invalid_preferences');
  const services = Object.keys(SERVICES);
  if (!Array.isArray(value.custom_services)) throw new Error('invalid_preferences');
  const customIds = new Set();
  for (const c of value.custom_services) {
    validateCustomService(c);
    if (customIds.has(c.id)) throw new Error('invalid_preferences');
    customIds.add(c.id);
  }
  const expectedOrderCount = services.length + customIds.size;
  if (!Array.isArray(value.service_order) || value.service_order.length !== expectedOrderCount || new Set(value.service_order).size !== expectedOrderCount || value.service_order.some(id => !services.includes(id) && !customIds.has(id))) throw new Error('invalid_preferences');
  if (!Array.isArray(value.hidden_services) || new Set(value.hidden_services).size !== value.hidden_services.length || value.hidden_services.some(id => !value.service_order.includes(id))) throw new Error('invalid_preferences');
  if (typeof value.ask_download_location !== 'boolean' || (value.download_directory !== null && (typeof value.download_directory !== 'string' || value.download_directory.length > 4096 || !path.isAbsolute(value.download_directory)))) throw new Error('invalid_preferences');

  const ids = new Set(defaultInstances().map(i => i.id));
  const validZoomInstance = id => ids.has(id) || customIds.has(id) || /^default_custom_[a-f0-9]{32}$/.test(id) || /^instance_(?:messenger|zalo|slack|chatgpt|gmail|gemini|meet|telegram|whatsapp|discord|custom_[a-f0-9]{32})_profile_[a-zA-Z0-9_-]{1,64}$/.test(id);
  if (!value.zoom_levels || typeof value.zoom_levels !== 'object' || Array.isArray(value.zoom_levels) || Object.entries(value.zoom_levels).some(([id, n]) => !validZoomInstance(id) || !Number.isFinite(n) || n < 0.5 || n > 2)) throw new Error('invalid_preferences');
  if (value.slack_workspace_url !== null && normalizeSlackWorkspace(value.slack_workspace_url) !== value.slack_workspace_url) throw new Error('invalid_workspace_url');
  return value;
}

class PreferencesStore {
  constructor(file) {
    this.file = file;
    this.persisted = true;
    try {
      this.value = validatePreferences(migratePreferences(readJSON(file)));
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('preferences_recovery_required', { cause: error });
      this.value = { ...DEFAULTS };
      this.persisted = false;
    }
    for (const c of this.value.custom_services || []) {
      registerCustomService(c);
    }
  }

  snapshot() {
    return {
      ...this.value,
      zoom_levels: { ...this.value.zoom_levels },
      service_order: [...this.value.service_order],
      hidden_services: [...this.value.hidden_services],
      custom_services: (this.value.custom_services || []).map(c => ({ ...c }))
    };
  }

  update(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(k => !['theme', 'language', 'slack_workspace_url', 'zoom_levels', 'download_directory', 'ask_download_location', 'service_order', 'hidden_services', 'custom_services'].includes(k))) throw new Error('invalid_preferences');
    const next = { ...this.value, ...patch };
    if (Object.hasOwn(patch, 'slack_workspace_url')) next.slack_workspace_url = normalizeSlackWorkspace(patch.slack_workspace_url);
    validatePreferences(next);
    writeJSON(this.file, next);
    this.value = {
      ...next,
      zoom_levels: { ...next.zoom_levels },
      service_order: [...next.service_order],
      hidden_services: [...next.hidden_services],
      custom_services: [...(next.custom_services || [])]
    };
    this.persisted = true;
    clearCustomServices();
    for (const c of this.value.custom_services || []) {
      registerCustomService(c);
    }
    return this.snapshot();
  }

  migrate(legacy) {
    if (this.persisted) return this.snapshot();
    const patch = {};
    if (THEMES.includes(legacy?.theme)) patch.theme = legacy.theme;
    if (['vi', 'en'].includes(legacy?.language)) patch.language = legacy.language;
    return this.update(patch);
  }

  reset() {
    const { schema_version: _schema, ...defaults } = DEFAULTS;
    const preservedCustom = [...(this.value.custom_services || [])];
    const customIds = preservedCustom.map(c => c.id);
    const serviceOrder = [...defaults.service_order, ...customIds];
    return this.update({
      ...defaults,
      language: this.value.language,
      custom_services: preservedCustom,
      service_order: serviceOrder
    });
  }
}

module.exports = {
  PreferencesStore,
  validatePreferences,
  migratePreferences,
  validateCustomService,
  DEFAULTS,
  THEMES,
  PRESET_CUSTOM_ICONS
};
