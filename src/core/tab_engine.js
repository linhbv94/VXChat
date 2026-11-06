'use strict';

const { randomUUID } = require('node:crypto');
const { service, SERVICES } = require('./services');
const { validateState } = require('./state_store');

class TabEngine {
  constructor({ store, createOwner, onChange = () => {} }) {
    this.store = store; this.createOwner = createOwner; this.onChange = onChange;
    this.state = validateState(store.load()); this.owners = new Map(); this.stopped = false;
    this.queue = Promise.resolve();
  }
  start() {
    try {
      if (this.store.needsInitialSave) this.store.save(this.state);
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
      tabs: this.state.tabs.map(tab => ({ ...tab, service_id: this.state.instances.find(i => i.id === tab.instance_id).service_id, status: this.owners.get(tab.id)?.status || 'idle', ...this.owners.get(tab.id)?.snapshot?.() })),
      active_tab_id: this.state.active_tab_id,
      services: Object.entries(SERVICES).map(([id, s]) => ({ id, label: s.label }))
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
  add(serviceID) {
    return this.enqueue(() => {
      const definition = service(serviceID);
      const instance = this.state.instances.find(i => i.service_id === serviceID);
      const existing = this.state.tabs.find(t => t.instance_id === instance.id);
      if (existing && !definition.multiTab) { this.selectNow(existing.id); return existing.id; }
      const used = new Set(this.state.tabs.map(t => t.label));
      let ordinal = 1;
      while (used.has(`${definition.label} ${ordinal}`)) ordinal++;
      const tab = { id: randomUUID(), instance_id: instance.id, label: definition.multiTab ? `${definition.label} ${ordinal}` : definition.label };
      const owner = this.allocate(tab);
      try { this.commit({ ...this.state, tabs: [...this.state.tabs, tab], active_tab_id: tab.id }); }
      catch (error) { owner.dispose(); throw error; }
      this.owners.set(tab.id, owner); owner.load(); this.present();
      return tab.id;
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
