'use strict';

const { randomUUID } = require('node:crypto');
const { service, SERVICES, customServicesList, registerCustomService, unregisterCustomService } = require('./services');
const { validateState } = require('./state_store');
const { scopeForService } = require('./profile_store');

class TabEngine {
  constructor({ store, profileStore = null, permissionStore = null, createOwner, onChange = () => {} }) {
    this.store = store; this.profileStore = profileStore; this.permissionStore = permissionStore; this.createOwner = createOwner; this.onChange = onChange;
    this.state = validateState(store.load()); this.owners = new Map(); this.stopped = false;

    // Attach default profile metadata to legacy instances if available
    if (this.profileStore) {
      const profiles = this.profileStore.snapshot();
      let updatedInstances = false;
      const instances = this.state.instances.map(inst => {
        if (!inst.profile_id) {
          const scope = scopeForService(inst.service_id);
          const match = profiles.find(p => p.scope_key === scope && (p.partition === inst.partition || p.is_default));
          if (match) {
            updatedInstances = true;
            return {
              ...inst,
              profile_id: match.id,
              profile_label: match.label,
              profile_color: match.color
            };
          }
        }
        return inst;
      });
      if (updatedInstances) this.state = { ...this.state, instances };
    }

    // Migrate the old generated AI label without replacing tabs or sessions.
    const tabs = this.state.tabs.map(tab => ({ ...tab }));
    for (const instance of this.state.instances.filter(i => service(i.service_id).multiTab)) {
      const label = service(instance.service_id).label;
      const used = new Set(tabs.filter(t => t.instance_id === instance.id && t.label !== `${label} 1`).map(t => t.label));
      for (const tab of tabs.filter(t => t.instance_id === instance.id && t.label === `${label} 1`)) {
        let next = label, ordinal = 2;
        while (used.has(next)) next = `${label} ${ordinal++}`;
        tab.label = next; used.add(next); this.labelsMigrated = true;
      }
    }
    this.state = { ...this.state, tabs };
    this.queue = Promise.resolve();
  }
  start() {
    try {
      if (this.store.needsInitialSave || this.labelsMigrated) this.store.save(this.state);
      for (const tab of this.state.tabs) this.owners.set(tab.id, this.allocate(tab));
      for (const owner of this.owners.values()) owner.load();
      this.present();
    } catch (error) { this.dispose(); throw error; }
  }
  allocate(tab) {
    const instance = this.state.instances.find(i => i.id === tab.instance_id);
    return this.createOwner({ tab, instance, generation: randomUUID(), isLive: owner => this.owners.get(tab.id) === owner && !this.stopped });
  }
  snapshot() {
    return {
      tabs: this.state.tabs.map(tab => {
        const instance = this.state.instances.find(i => i.id === tab.instance_id);
        return {
          ...tab,
          service_id: instance?.service_id,
          instance_id: instance?.id,
          profile_id: instance?.profile_id,
          profile_label: instance?.profile_label,
          profile_color: instance?.profile_color,
          status: this.owners.get(tab.id)?.status || 'idle',
          ...this.owners.get(tab.id)?.snapshot?.()
        };
      }),
      instances: this.state.instances.map(i => ({
        id: i.id,
        service_id: i.service_id,
        label: i.label,
        partition: i.partition,
        profile_id: i.profile_id,
        profile_label: i.profile_label,
        profile_color: i.profile_color
      })),
      profiles: this.profileStore ? this.profileStore.snapshot() : [],
      active_tab_id: this.state.active_tab_id,
      services: [
        ...Object.entries(SERVICES).map(([id, s]) => ({ id, label: s.label, multiTab: Boolean(s.multiTab), is_custom: false })),
        ...customServicesList().map(s => ({ id: s.id, label: s.label, multiTab: false, is_custom: true, icon_key: s.icon_key, service_url: s.url, login_url: s.login_url }))
      ]
    };
  }
  present() {
    for (const [id, owner] of this.owners) owner.setSelected(id === this.state.active_tab_id);
    this.onChange(this.snapshot());
  }
  enqueue(work) {
    const result = this.queue.then(() => { if (this.stopped) throw new Error('engine_stopped'); return work(); });
    this.queue = result.catch(() => {});
    return result;
  }
  commit(next) { validateState(next); try { this.store.save(next); } catch (error) { throw new Error('config_write_failed', { cause: error }); } this.state = next; }
  addNow(serviceID, instanceID = null) {
    const definition = service(serviceID);
    let instance;
    if (instanceID) {
      instance = this.state.instances.find(i => i.id === instanceID);
      if (!instance) throw new Error('unknown_instance');
    } else {
      instance = this.state.instances.find(i => i.service_id === serviceID && i.id === `default_${serviceID}`)
        || this.state.instances.find(i => i.service_id === serviceID);
      if (!instance) throw new Error('unknown_instance');
    }
    const existing = this.state.tabs.find(t => t.instance_id === instance.id);
    if (existing && !definition.multiTab) { this.selectNow(existing.id); return existing.id; }
    const used = new Set(this.state.tabs.map(t => t.label));

    const instanceCount = this.state.instances.filter(i => i.service_id === serviceID).length;
    let baseLabel = definition.label;
    if (instanceCount >= 2 && instance.profile_label) {
      baseLabel = `${definition.label} (${instance.profile_label})`;
    }
    let label = baseLabel, ordinal = 2;
    while (definition.multiTab && used.has(label)) label = `${baseLabel} ${ordinal++}`;
    const tab = { id: randomUUID(), instance_id: instance.id, label };
    const owner = this.allocate(tab);
    try { this.commit({ ...this.state, tabs: [...this.state.tabs, tab], active_tab_id: tab.id }); }
    catch (error) { owner.dispose(); throw error; }
    this.owners.set(tab.id, owner); owner.load(); this.present();
    return tab.id;
  }
  add(serviceID, instanceID = null) {
    return this.enqueue(() => this.addNow(serviceID, instanceID));
  }
  createAccount({ service_id, label, color = 'blue' }) {
    return this.enqueue(async () => {
      if (!this.profileStore) throw new Error('profile_store_not_available');
      const scopeKey = scopeForService(service_id);
      const profile = this.profileStore.create({ scope_key: scopeKey, label, color });

      const newInstances = [];
      if (scopeKey === 'google') {
        for (const sId of ['gmail', 'gemini', 'meet']) {
          newInstances.push({
            id: `instance_${sId}_${profile.id}`,
            service_id: sId,
            label: service(sId).label,
            partition: profile.partition,
            profile_id: profile.id,
            profile_label: profile.label,
            profile_color: profile.color
          });
        }
      } else {
        newInstances.push({
          id: `instance_${service_id}_${profile.id}`,
          service_id,
          label: service(service_id).label,
          partition: profile.partition,
          profile_id: profile.id,
          profile_label: profile.label,
          profile_color: profile.color
        });
      }

      const previousState = this.state;
      try {
        const nextInstances = [...this.state.instances, ...newInstances];
        const nextTabs = this.state.tabs.map(t => {
          const inst = nextInstances.find(i => i.id === t.instance_id);
          if (!inst || !inst.profile_label) return t;
          const count = nextInstances.filter(i => i.service_id === inst.service_id).length;
          if (count < 2) return t;
          const def = service(inst.service_id);
          const prefix = `${def.label} (${inst.profile_label})`;
          if (t.label === def.label) return { ...t, label: prefix };
          if (t.label.startsWith(`${def.label} `) && !t.label.startsWith(`${def.label} (`)) {
            return { ...t, label: `${prefix}${t.label.slice(def.label.length)}` };
          }
          return t;
        });
        this.commit({ ...this.state, instances: nextInstances, tabs: nextTabs });

        const targetInstance = newInstances.find(i => i.service_id === service_id);
        const tabId = await this.addNow(service_id, targetInstance.id);
        return { profile, instance: targetInstance, tab_id: tabId };
      } catch (error) {
        try { this.profileStore.delete(profile.id); } catch {}
        try { this.commit(previousState); } catch {}
        throw error;
      }
    });
  }
  deleteAccount(profileId) {
    return this.enqueue(async () => {
      if (!this.profileStore) throw new Error('profile_store_not_available');
      const profile = this.profileStore.get(profileId);
      if (!profile) throw new Error('account_not_found');
      if (profile.is_default || profileId.startsWith('default_')) {
        throw new Error('cannot_delete_default_profile');
      }

      const targetInstances = this.state.instances.filter(i => i.profile_id === profileId);
      if (!targetInstances.length) throw new Error('account_not_found');
      const instanceIds = new Set(targetInstances.map(i => i.id));

      const closingTabs = this.state.tabs.filter(t => instanceIds.has(t.instance_id));
      const remainingInstances = this.state.instances.filter(i => !instanceIds.has(i.id));
      const remainingTabs = this.state.tabs.filter(t => !instanceIds.has(t.instance_id)).map(t => {
        const inst = remainingInstances.find(i => i.id === t.instance_id);
        if (!inst) return t;
        const count = remainingInstances.filter(i => i.service_id === inst.service_id).length;
        if (count >= 2) return t;
        const def = service(inst.service_id);
        const parenPrefix = `${def.label} (${inst.profile_label || ''})`;
        const dotPrefix = `${def.label} · ${inst.profile_label || ''}`;
        for (const pfx of [parenPrefix, dotPrefix]) {
          if (t.label === pfx) return { ...t, label: def.label };
          if (t.label.startsWith(`${pfx} `)) return { ...t, label: `${def.label}${t.label.slice(pfx.length)}` };
        }
        return t;
      });
      const nextActive = remainingTabs.some(t => t.id === this.state.active_tab_id)
        ? this.state.active_tab_id
        : (remainingTabs[0]?.id || null);

      const originalState = this.state;
      this.commit({
        ...this.state,
        instances: remainingInstances,
        tabs: remainingTabs,
        active_tab_id: nextActive
      });

      try {
        this.profileStore.delete(profileId);
      } catch (error) {
        this.commit(originalState);
        throw error;
      }

      for (const tab of closingTabs) {
        const owner = this.owners.get(tab.id);
        if (owner) {
          this.owners.delete(tab.id);
          owner.dispose();
        }
      }

      this.present();
      return { ok: true, profile_id: profileId };
    });
  }
  updateAccount(profileId, { label, color }) {
    return this.enqueue(() => {
      if (!this.profileStore) throw new Error('profile_store_not_available');
      const oldProfile = this.profileStore.get(profileId);
      if (!oldProfile) throw new Error('account_not_found');

      const updatedProfile = this.profileStore.update(profileId, { label, color });
      const updatedInstances = this.state.instances.map(i => {
        if (i.profile_id === profileId) {
          return {
            ...i,
            profile_label: updatedProfile.label,
            profile_color: updatedProfile.color
          };
        }
        return i;
      });
      const updatedTabs = this.state.tabs.map(t => {
        const inst = updatedInstances.find(i => i.id === t.instance_id);
        if (!inst || inst.profile_id !== profileId) return t;
        const def = service(inst.service_id);
        const count = updatedInstances.filter(i => i.service_id === inst.service_id).length;
        if (count < 2) return { ...t, label: def.label };
        const oldParenPrefix = `${def.label} (${oldProfile.label})`;
        const oldDotPrefix = `${def.label} · ${oldProfile.label}`;
        const newPrefix = `${def.label} (${updatedProfile.label})`;
        if (t.label === def.label || t.label === oldParenPrefix || t.label === oldDotPrefix) {
          return { ...t, label: newPrefix };
        }
        for (const pfx of [oldParenPrefix, oldDotPrefix]) {
          if (t.label.startsWith(`${pfx} `)) {
            return { ...t, label: `${newPrefix}${t.label.slice(pfx.length)}` };
          }
        }
        return t;
      });

      try {
        this.commit({
          ...this.state,
          instances: updatedInstances,
          tabs: updatedTabs
        });
      } catch (error) {
        try { this.profileStore.update(profileId, { label: oldProfile.label, color: oldProfile.color }); } catch {}
        throw error;
      }

      this.present();
      return { ok: true, profile: updatedProfile };
    });
  }
  createCustomService(customService) {
    return this.enqueue(async () => {
      const previousState = this.state;
      let createdProfile = null;
      let registered = false;
      let def = null;
      try {
        def = registerCustomService(customService);
        registered = true;
        if (this.profileStore) {
          createdProfile = this.profileStore.createDefault({ scope_key: customService.id, label: 'Mặc định', color: 'blue' });
        }
        const instance = {
          id: `default_${customService.id}`,
          service_id: customService.id,
          label: def.label,
          partition: `persist:service-${customService.id}`,
          profile_id: `default_${customService.id}`,
          profile_label: 'Mặc định',
          profile_color: 'blue'
        };
        this.commit({
          ...this.state,
          instances: [...this.state.instances, instance]
        });
        const tabId = await this.addNow(customService.id, instance.id);
        return { ok: true, service: def, tab_id: tabId };
      } catch (err) {
        if (this.profileStore && createdProfile) {
          try { this.profileStore.deleteScope(customService.id); } catch {}
        }
        if (registered) {
          unregisterCustomService(customService.id);
        }
        try { this.commit(previousState); } catch {}
        throw err;
      }
    });
  }
  deleteCustomService(serviceId) {
    if (!serviceId || typeof serviceId !== 'string' || !serviceId.startsWith('custom_')) {
      return Promise.reject(new Error('cannot_delete_builtin_service'));
    }
    return this.enqueue(async () => {
      if (!serviceId.startsWith('custom_')) {
        throw new Error('cannot_delete_builtin_service');
      }
      const targetInstances = this.state.instances.filter(i => i.service_id === serviceId);
      const instanceIds = new Set(targetInstances.map(i => i.id));
      const closingTabs = this.state.tabs.filter(t => instanceIds.has(t.instance_id));
      const closingTabIds = new Set(closingTabs.map(t => t.id));

      const remainingInstances = this.state.instances.filter(i => !instanceIds.has(i.id));
      const remainingTabs = this.state.tabs.filter(t => !closingTabIds.has(t.id));
      const nextActive = remainingTabs.some(t => t.id === this.state.active_tab_id)
        ? this.state.active_tab_id
        : (remainingTabs[0]?.id || null);

      // Clean up permissions and profiles first without swallowing errors
      if (this.permissionStore) {
        this.permissionStore.deleteScope(serviceId);
      }

      if (this.profileStore) {
        this.profileStore.deleteScope(serviceId);
      }

      // Commit state first before tearing down live owners, ensuring atomic commit
      this.commit({
        ...this.state,
        instances: remainingInstances,
        tabs: remainingTabs,
        active_tab_id: nextActive
      });

      // Tear down owners only after state write has succeeded
      for (const tab of closingTabs) {
        const owner = this.owners.get(tab.id);
        if (owner) {
          this.owners.delete(tab.id);
          try { owner.dispose(); } catch {}
        }
      }

      unregisterCustomService(serviceId);
      this.present();
      return { ok: true, service_id: serviceId };
    });
  }
  selectNow(id) {
    if (!this.owners.has(id)) throw new Error('tab_not_found');
    if (id !== this.state.active_tab_id) this.commit({ ...this.state, active_tab_id: id });
    this.present();
  }
  select(id) { return this.enqueue(() => this.selectNow(id)); }
  close(id) {
    return this.enqueue(async () => {
      const owner = this.owners.get(id);
      if (!owner) throw new Error('tab_not_found');
      if (!await owner.confirmClose()) return { status: 'cancelled' };
      if (this.stopped || this.owners.get(id) !== owner) throw new Error('engine_stopped');
      const index = this.state.tabs.findIndex(t => t.id === id);
      const tabs = this.state.tabs.filter(t => t.id !== id);
      const active = id === this.state.active_tab_id ? (tabs[Math.min(index, tabs.length - 1)]?.id || null) : this.state.active_tab_id;
      this.commit({ ...this.state, tabs, active_tab_id: active });
      this.owners.delete(id); owner.dispose(); this.present();
      return { status: 'closed' };
    });
  }
  reorder(ids) {
    return this.enqueue(() => {
      if (!Array.isArray(ids) || ids.length !== this.state.tabs.length || new Set(ids).size !== ids.length || ids.some(id => !this.owners.has(id))) throw new Error('invalid_order');
      this.commit({ ...this.state, tabs: ids.map(id => this.state.tabs.find(t => t.id === id)) }); this.present();
    });
  }
  reload(id) {
    return this.enqueue(() => { const owner = this.owners.get(id); if (!owner) throw new Error('tab_not_found'); owner.reload(); });
  }
  home(id) { return this.enqueue(async () => { const owner = this.owners.get(id); if (!owner) throw new Error('tab_not_found'); await owner.home(); }); }
  setup(id, confirm) { return this.enqueue(async () => { const owner = this.owners.get(id); if (!owner) throw new Error('tab_not_found'); await (confirm ? owner.confirmSetup() : owner.reopenSetup()); }); }
  popup(id, popupID, action) {
    return this.enqueue(() => {
      const owner = this.owners.get(id); if (!owner) throw new Error('tab_not_found');
      if (action === 'focus') owner.focusPopup(popupID); else if (action === 'close') owner.closePopup(popupID); else throw new Error('invalid_command');
    });
  }
  cycle(delta) {
    return this.enqueue(() => {
      const tabs = this.state.tabs; if (!tabs.length) return;
      const index = tabs.findIndex(t => t.id === this.state.active_tab_id);
      this.selectNow(tabs[(index + delta + tabs.length) % tabs.length].id);
    });
  }
  dispose() {
    this.stopped = true;
    for (const owner of this.owners.values()) owner.dispose();
    this.owners.clear();
  }
}
module.exports = { TabEngine };
