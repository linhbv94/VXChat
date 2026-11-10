'use strict';

const { randomUUID } = require('node:crypto');
const { readJSON, writeJSON, MAX_BYTES } = require('./atomic_json');
const { service } = require('./services');

const PROFILE_COLORS = Object.freeze({
  blue: '#3b82f6',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  orange: '#f97316',
  pink: '#ec4899'
});

const COLOR_KEYS = Object.keys(PROFILE_COLORS);

function scopeForService(serviceId) {
  if (['gmail', 'gemini', 'meet'].includes(serviceId)) return 'google';
  return serviceId;
}

function partitionForProfile(scopeKey, profileId) {
  if (profileId === 'default_google') return 'persist:service-google';
  if (profileId.startsWith('default_')) return `persist:service-${scopeKey}`;
  if (scopeKey === 'google') return `persist:service-google-${profileId}`;
  return `persist:service-${scopeKey}-${profileId}`;
}

function defaultProfiles() {
  return [
    { id: 'default_google', scope_key: 'google', label: 'Cá nhân', color: 'blue', partition: 'persist:service-google', is_default: true, created_at: 0 },
    { id: 'default_messenger', scope_key: 'messenger', label: 'Cá nhân', color: 'blue', partition: 'persist:service-messenger', is_default: true, created_at: 0 },
    { id: 'default_zalo', scope_key: 'zalo', label: 'Cá nhân', color: 'blue', partition: 'persist:service-zalo', is_default: true, created_at: 0 },
    { id: 'default_slack', scope_key: 'slack', label: 'Cá nhân', color: 'blue', partition: 'persist:service-slack', is_default: true, created_at: 0 },
    { id: 'default_chatgpt', scope_key: 'chatgpt', label: 'Cá nhân', color: 'blue', partition: 'persist:service-chatgpt', is_default: true, created_at: 0 },
    { id: 'default_telegram', scope_key: 'telegram', label: 'Cá nhân', color: 'blue', partition: 'persist:service-telegram', is_default: true, created_at: 0 },
    { id: 'default_whatsapp', scope_key: 'whatsapp', label: 'Cá nhân', color: 'blue', partition: 'persist:service-whatsapp', is_default: true, created_at: 0 },
    { id: 'default_discord', scope_key: 'discord', label: 'Cá nhân', color: 'blue', partition: 'persist:service-discord', is_default: true, created_at: 0 }
  ];
}

function validLabel(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 32 && !/[\x00-\x1f\x7f]/.test(value);
}

function validColor(value) {
  return typeof value === 'string' && COLOR_KEYS.includes(value);
}

function migrateProfiles(data) {
  if (!data || typeof data !== 'object' || data.schema_version !== 1 || !Array.isArray(data.profiles)) {
    return data;
  }
  const validProfiles = data.profiles.filter(p => {
    if (!p || typeof p !== 'object') return false;
    if (typeof p.scope_key === 'string' && p.scope_key.startsWith('custom_')) {
      try { return !!service(p.scope_key); } catch { return false; }
    }
    return true;
  });
  const defaults = defaultProfiles();
  const existingIds = new Set(validProfiles.map(p => p.id));
  const missing = defaults.filter(d => !existingIds.has(d.id));
  return { ...data, profiles: [...validProfiles, ...missing] };
}

function validateProfiles(data) {
  if (!data || typeof data !== 'object' || data.schema_version !== 1 || !Array.isArray(data.profiles)) {
    throw new Error('invalid_profiles_data');
  }
  const defaults = defaultProfiles();
  for (const def of defaults) {
    if (!data.profiles.some(p => p.id === def.id && p.scope_key === def.scope_key && p.partition === def.partition && p.is_default)) {
      throw new Error('missing_default_profile');
    }
  }
  const ids = new Set();
  const partitions = new Set();
  for (const p of data.profiles) {
    if (ids.has(p.id)) throw new Error('duplicate_profile_id');
    ids.add(p.id);
    if (!validLabel(p.label)) throw new Error('invalid_profile_label');
    if (!validColor(p.color)) throw new Error('invalid_profile_color');
    if (typeof p.partition !== 'string') throw new Error('invalid_profile_partition');
    const expectedPartition = partitionForProfile(p.scope_key, p.id);
    if (p.partition !== expectedPartition) throw new Error('invalid_profile_partition');
    if (partitions.has(p.partition)) throw new Error('duplicate_profile_partition');
    partitions.add(p.partition);
  }
  if (Buffer.byteLength(JSON.stringify(data)) > MAX_BYTES) throw new Error('profiles_too_large');
  return data;
}

class ProfileStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this.load();
  }

  load() {
    try {
      const parsed = readJSON(this.filePath);
      const migrated = migrateProfiles(parsed);
      const validated = validateProfiles(migrated);
      if (JSON.stringify(migrated) !== JSON.stringify(parsed)) this.saveData(validated);
      return validated;
    } catch (err) {
      if (err.code === 'ENOENT') {
        const initial = { schema_version: 1, profiles: defaultProfiles() };
        this.saveData(initial);
        return initial;
      }
      throw new Error('profile_recovery_required', { cause: err });
    }
  }

  saveData(data) {
    validateProfiles(data);
    writeJSON(this.filePath, data);
  }

  snapshot() {
    return this.data.profiles.map(p => ({ ...p }));
  }

  byScope(scopeKey) {
    return this.data.profiles.filter(p => p.scope_key === scopeKey).map(p => ({ ...p }));
  }

  get(id) {
    const found = this.data.profiles.find(p => p.id === id);
    return found ? { ...found } : null;
  }

  create({ scope_key, label, color = 'blue' }) {
    const isCustom = typeof scope_key === 'string' && /^custom_[a-f0-9]{32}$/.test(scope_key);
    if (!isCustom && !['google', 'messenger', 'zalo', 'slack', 'chatgpt', 'telegram', 'whatsapp', 'discord'].includes(scope_key)) {
      throw new Error('invalid_scope_key');
    }
    const cleanLabel = (label || '').trim();
    if (!validLabel(cleanLabel)) throw new Error('invalid_profile_label');
    const cleanColor = validColor(color) ? color : 'blue';

    const id = `profile_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const partition = partitionForProfile(scope_key, id);
    const newProfile = {
      id,
      scope_key,
      label: cleanLabel,
      color: cleanColor,
      partition,
      is_default: false,
      created_at: Date.now()
    };

    const next = {
      ...this.data,
      profiles: [...this.data.profiles, newProfile]
    };
    this.saveData(next);
    this.data = next;
    return { ...newProfile };
  }

  createDefault({ scope_key, label = 'Mặc định', color = 'blue' }) {
    const cleanLabel = (label || '').trim() || 'Mặc định';
    if (!validLabel(cleanLabel)) throw new Error('invalid_profile_label');
    const cleanColor = validColor(color) ? color : 'blue';
    const id = `default_${scope_key}`;
    const partition = partitionForProfile(scope_key, id);
    const newProfile = {
      id,
      scope_key,
      label: cleanLabel,
      color: cleanColor,
      partition,
      is_default: true,
      created_at: Date.now()
    };
    const next = {
      ...this.data,
      profiles: [...this.data.profiles, newProfile]
    };
    this.saveData(next);
    this.data = next;
    return { ...newProfile };
  }

  deleteScope(scopeKey) {
    const remaining = this.data.profiles.filter(p => p.scope_key !== scopeKey);
    const next = {
      ...this.data,
      profiles: remaining
    };
    this.saveData(next);
    this.data = next;
  }

  update(id, { label, color }) {
    const profile = this.data.profiles.find(p => p.id === id);
    if (!profile) throw new Error('profile_not_found');

    const cleanLabel = label !== undefined ? label.trim() : profile.label;
    if (!validLabel(cleanLabel)) throw new Error('invalid_profile_label');
    const cleanColor = color !== undefined ? color : profile.color;
    if (!validColor(cleanColor)) throw new Error('invalid_profile_color');

    const updated = {
      ...profile,
      label: cleanLabel,
      color: cleanColor
    };

    const next = {
      ...this.data,
      profiles: this.data.profiles.map(p => p.id === id ? updated : p)
    };
    this.saveData(next);
    this.data = next;
    return { ...updated };
  }

  delete(id) {
    const profile = this.data.profiles.find(p => p.id === id);
    if (!profile) throw new Error('profile_not_found');
    if (profile.is_default || profile.id.startsWith('default_')) {
      throw new Error('cannot_delete_default_profile');
    }

    const next = {
      ...this.data,
      profiles: this.data.profiles.filter(p => p.id !== id)
    };
    this.saveData(next);
    this.data = next;
    return { ...profile };
  }
}

module.exports = {
  ProfileStore,
  PROFILE_COLORS,
  COLOR_KEYS,
  scopeForService,
  partitionForProfile,
  defaultProfiles
};
