'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initialState, StateStore, validateState } = require('../src/core/state_store');
const { TabEngine } = require('../src/core/tab_engine');
const { convertSwiftTabs } = require('../src/core/legacy_metadata');
const { navigationKind, browserUserAgent, popupDisposition, ownedBlobURL } = require('../src/core/services');
const { validCommand, trustedShell } = require('../src/main/ipc');

function fixture() {
  const store = { state: initialState(), fail: false, load() { return structuredClone(this.state); }, save(state) { if (this.fail) throw new Error('disk_full'); this.state = structuredClone(state); } };
  const owners = [];
  const engine = new TabEngine({ store, createOwner: args => {
    const owner = { ...args, loads: 0, reloads: 0, disposed: false, selected: false, allowClose: true,
      load() { this.loads++; }, reload() { this.reloads++; }, setSelected(v) { this.selected = v; },
      async confirmClose() { return this.allowClose; }, dispose() { this.disposed = true; }
    }; owners.push(owner); return owner;
  } });
  engine.start(); return { engine, store, owners };
}
test('non-AI duplicate selects existing without allocation/load; AI shares instance but owns new view', async () => {
  const { engine, owners } = fixture();
  const existing = engine.state.tabs.find(t => t.instance_id === 'default_slack');
  assert.equal(await engine.add('slack'), existing.id); assert.equal(owners.length, 4);
  const a = engine.state.tabs.find(t => t.instance_id === 'default_chatgpt');
  const b = await engine.add('chatgpt'); assert.notEqual(a.id, b);
  assert.equal(engine.state.tabs.find(t => t.id === b).instance_id, a.instance_id);
  assert.notEqual(engine.owners.get(a.id).generation, engine.owners.get(b).generation);
  for (let i = 0; i < 20; i++) await engine.select(i % 2 ? a.id : b);
  assert.equal(engine.owners.get(a.id).loads, 1); assert.equal(engine.owners.get(b).loads, 1);
  await engine.reload(b); assert.equal(engine.owners.get(a.id).reloads, 0); assert.equal(engine.owners.get(b).reloads, 1);
});
test('close disposes one owner and late callbacks lose liveness; valid empty state persists', async () => {
  const { engine, store } = fixture();
  const id = engine.state.active_tab_id; const old = engine.owners.get(id);
  await engine.close(id); assert.ok(old.disposed); assert.equal(old.isLive(old), false);
  for (const tab of [...engine.state.tabs]) await engine.close(tab.id);
  assert.equal(engine.state.active_tab_id, null); assert.deepEqual(store.state.tabs, []);
  validateState(store.state);
});
test('save failure leaves live tabs/state intact and tears down an uncommitted allocation', async () => {
  const { engine, store, owners } = fixture(); const before = structuredClone(engine.state);
  store.fail = true;
  await assert.rejects(engine.add('chatgpt')); assert.deepEqual(engine.state, before); assert.ok(owners.at(-1).disposed);
  await assert.rejects(engine.close(before.active_tab_id)); assert.deepEqual(engine.state, before); assert.equal(engine.owners.get(before.active_tab_id).disposed, false);
  await assert.rejects(engine.select(before.tabs[1].id)); assert.deepEqual(engine.state, before);
});
test('cancel close and invalid reorders are non-destructive; reorder retains owners', async () => {
  const { engine } = fixture(); const id = engine.state.active_tab_id; engine.owners.get(id).allowClose = false;
  assert.equal((await engine.close(id)).status, 'cancelled'); assert.ok(engine.owners.has(id));
  await assert.rejects(engine.reorder([id, id]));
  const order = engine.state.tabs.map(t => t.id).reverse(); const old = engine.owners.get(id);
  await engine.reorder(order); assert.deepEqual(engine.state.tabs.map(t => t.id), order); assert.equal(engine.owners.get(id), old);
});
test('dispose during a pending close prompt prevents stale metadata writes', async () => {
  const { engine, store } = fixture(); const id = engine.state.active_tab_id;
  let finish; engine.owners.get(id).confirmClose = () => new Promise(resolve => { finish = resolve; });
  const before = structuredClone(store.state); const closing = engine.close(id);
  await new Promise(resolve => setImmediate(resolve)); engine.dispose(); finish(true);
  await assert.rejects(closing); assert.deepEqual(store.state, before);
});
test('metadata rejects unknown providers, extra/secret fields, duplicate IDs and invalid partitions', () => {
  for (const mutate of [s => s.tabs.push({ ...s.tabs[0] }), s => s.tabs[0].cookie = 'secret', s => s.instances[0].partition = 'persist:attacker', s => s.instances[0].service_id = 'gemini']) {
    const s = initialState(); mutate(s); assert.throws(() => validateState(s));
  }
});
test('atomic state save/reopen works; corrupt/newer metadata is preserved rather than reset', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_state_'));
  try {
    const file = path.join(dir, 'state.json'); const store = new StateStore(file); const state = store.load(); store.save(state);
    assert.deepEqual(new StateStore(file).load(), state);
    for (const text of ['{bad', JSON.stringify({ ...state, schema_version: 99 })]) {
      fs.writeFileSync(file, text); assert.throws(() => new StateStore(file).load(), /recovery_required/); assert.equal(fs.readFileSync(file, 'utf8'), text);
    }
  } finally { fs.rmSync(dir, { recursive: true }); }
});
test('explicit Swift conversion retains only metadata and does not copy entry/auth URLs', () => {
  const state = convertSwiftTabs({ activeTabID: 'old', tabs: [{ id: 'old', serviceID: 'chatgpt', label: 'ChatGPT', entryURL: 'https://auth.example/?token=secret', generation: 5 }] });
  assert.equal(state.tabs.length, 1); assert.equal(state.tabs[0].instance_id, 'default_chatgpt');
  assert.ok(!JSON.stringify(state).includes('secret')); assert.deepEqual(convertSwiftTabs({ tabs: [], activeTabID: null }).tabs, []);
});
test('navigation classifies parsed hosts and schemes instead of substring trust; UA retains real Chromium', () => {
  assert.equal(navigationKind('slack', 'https://app.slack.com/client/T'), 'service');
  for (const url of ['https://slack.com.evil.test/', 'https://evil.test/?slack.com', 'https://accounts.google.com.evil.test']) assert.equal(navigationKind('slack', url), 'external');
  for (const url of ['javascript:alert(1)', 'file:///tmp/a', 'https://user:pass@slack.com']) assert.equal(navigationKind('slack', url), 'blocked');
  assert.equal(navigationKind('slack', 'https://accounts.google.com/o/oauth'), 'auth');
  assert.equal(browserUserAgent('Mac Chrome/156.0.1 Safari/537 Electron/45.2.3 VXChat/0.2.0'), 'Mac Chrome/156.0.1 Safari/537');
});
test('IPC rejects remote frames, service-supplied partitions and malformed commands', () => {
  const frame = { url: 'file:///shell.html' }; const contents = { mainFrame: frame };
  assert.ok(trustedShell({ sender: contents, senderFrame: frame }, contents, frame.url));
  assert.equal(trustedShell({ sender: {}, senderFrame: frame }, contents, frame.url), false);
  assert.equal(trustedShell({ sender: contents, senderFrame: { url: frame.url } }, contents, frame.url), false);
  assert.ok(validCommand({ action: 'add', service_id: 'chatgpt' }));
  assert.ok(validCommand({ action: 'settings' }));
  for (const c of [{ action: 'add', service_id: 'slack', partition: 'persist:other' }, { action: 'select', tab_id: {} }, { action: 'reorder', tab_ids: [1] }, { action: '__proto__' }]) assert.equal(validCommand(c), false);
});
test('popups retain ownership until an eligible client navigation commits', () => {
  assert.equal(popupDisposition('slack', 'https://app.slack.com/client/T/C'), 'owned');
  assert.equal(popupDisposition('messenger', 'https://www.messenger.com/call/123'), 'owned');
  assert.equal(popupDisposition('slack', 'https://app.slack.com/huddle/T'), 'owned');
  assert.equal(popupDisposition('chatgpt', 'https://accounts.google.com/oauth'), 'owned');
  assert.equal(popupDisposition('chatgpt', 'about:blank'), 'owned');
  assert.equal(popupDisposition('slack', 'https://app.slack.com.evil.test/client/T', { phase: 'client_ready' }), 'external');
  assert.equal(popupDisposition('slack', 'file:///tmp/a'), 'blocked');
});
test('attachment blob previews are scoped to the initiating HTTPS origin; file/data and foreign blobs stay blocked', () => {
  assert.equal(ownedBlobURL('blob:https://app.slack.com/fixture', 'https://app.slack.com/client/T'), true);
  assert.equal(ownedBlobURL('blob:https://app.slack.com/second', 'blob:https://app.slack.com/first'), true);
  assert.equal(ownedBlobURL('blob:https://evil.test/fixture', 'https://app.slack.com/client/T'), false);
  for (const url of ['file:///tmp/a', 'data:text/html,x', 'blob:null/fixture']) assert.equal(ownedBlobURL(url, 'https://app.slack.com/client/T'), false);
});
test('tab reordering reorders tabs correctly across left-to-right and right-to-left placements', () => {
  const reorder = require('../src/shell/tab_order');
  assert.deepEqual(reorder(['A', 'B', 'C'], 'A', 'B', false), ['A', 'B', 'C']);
  assert.deepEqual(reorder(['A', 'B', 'C'], 'A', 'B', true), ['B', 'A', 'C']);
  assert.deepEqual(reorder(['A', 'B', 'C'], 'A', 'C', true), ['B', 'C', 'A']);
  assert.deepEqual(reorder(['A', 'B', 'C'], 'C', 'A', false), ['C', 'A', 'B']);
  assert.deepEqual(reorder(['A', 'B', 'C'], 'C', 'A', true), ['A', 'C', 'B']);
  assert.deepEqual(reorder(['A', 'B', 'C'], 'C', 'B', true), ['A', 'B', 'C']);
});
