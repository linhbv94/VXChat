'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { ContentOwner } = require('../src/main/content_owner');
const { defaultInstances } = require('../src/core/services');
class Contents extends EventEmitter {
  constructor(url = '') { super(); this.url = url; this.destroyed = false; this.reloads = 0; }
  getURL() { return this.url; } isDestroyed() { return this.destroyed; }
  setWindowOpenHandler(handler) { this.open = handler; }
  async loadURL(url) { this.url = url; this.emit('did-finish-load'); }
  reload() { this.reloads++; }
  async insertCSS(css) { this.lastCSS = css; return 'fixture-css'; }
  async removeInsertedCSS() { this.lastCSS = null; }
  isCurrentlyAudible() { return false; }
  close() { this.destroyed = true; this.emit('destroyed'); }
}
class Child extends EventEmitter {
  constructor(url = 'about:blank') { super(); this.webContents = new Contents(url); this.destroyed = false; this.focused = false; }
  isDestroyed() { return this.destroyed; } show() {} focus() { this.focused = true; }
  close() { this.destroy(); }
  destroy() { if (this.destroyed) return; this.destroyed = true; this.webContents.close(); this.emit('closed'); }
}
function fixture(serviceID = 'slack', overrides = {}) {
  const registry = new Map(); const children = new Set(); let updates = 0;
  const instance = defaultInstances().find(i => i.service_id === serviceID);
  const window = { isDestroyed: () => false, getContentBounds: () => ({ width: 1000, height: 800 }), contentView: { addChildView: view => children.add(view), removeChildView: view => children.delete(view) } };
  const electron = { WebContentsView: class { constructor(options) { this.options = options; this.webContents = new Contents(); } setBounds(bounds) { this.bounds = bounds; } }, dialog: { showMessageBox: async () => ({ response: 0 }) }, shell: { openExternal: async () => {} } };
  const owner = new ContentOwner({ tab: { id: 'tab', label: 'Fixture' }, instance, generation: 'fixture', isLive: () => true, electron, window, sessionPolicy: { get: () => ({}) }, register: (wc, o) => registry.set(wc, o), unregister: wc => registry.delete(wc), changed: () => updates++, getChromeHeight: () => 90, ...overrides });
  return { owner, wc: owner.view.webContents, registry, children, updates: () => updates };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('Zalo auth stays authenticating across a company callback and hands only the client back to primary', async () => {
  const { owner, wc } = fixture('zalo');
  const opened = []; owner.electron.shell.openExternal = async value => opened.push(value);
  wc.url = 'https://id.zalo.me/account?continue=https%3A%2F%2Fchat.zalo.me%2F'; wc.emit('did-finish-load');
  assert.equal(owner.workflow.phase,'authenticating');
  let prevented = false;
  wc.emit('will-redirect',{preventDefault(){prevented=true;}},'https://callback.example.test/auth/complete');
  assert.equal(prevented,false); assert.deepEqual(opened,[]);
  const child = new Child('https://id.zalo.me/account'); wc.emit('did-create-window',child,{url:'https://id.zalo.me/account'});
  child.webContents.emit('did-finish-load'); await tick();
  assert.equal(wc.getURL().startsWith('https://id.zalo.me/'),true); assert.equal(child.isDestroyed(),false);
  child.webContents.url='https://chat.zalo.me/'; child.webContents.emit('did-finish-load'); await tick();
  assert.equal(wc.url,'https://chat.zalo.me/'); assert.equal(owner.workflow.phase,'client_ready');
  assert.equal(child.isDestroyed(),true); assert.deepEqual(opened,[]); owner.dispose();
});
test('an unrelated Zalo popup must not replace an active chat or masquerade as a completed login', async () => {
  const { owner, wc } = fixture('zalo'); wc.url='https://chat.zalo.me/'; wc.emit('did-finish-load');
  const child = new Child('https://chat.zalo.me/'); wc.emit('did-create-window',child,{url:'https://chat.zalo.me/'});
  child.webContents.emit('did-finish-load'); await tick();
  assert.equal(child.isDestroyed(),false); assert.equal(wc.url,'https://chat.zalo.me/'); owner.dispose();
});
test('owner retains blank popup/opener and exposes ID actions without leaking callback URLs', () => {
  const { owner, wc, registry } = fixture(); wc.url = 'https://team.slack.com/sso';
  const decision = wc.open({ url: 'about:blank' }); assert.equal(decision.action, 'allow'); assert.equal(decision.overrideBrowserWindowOptions.webPreferences.nodeIntegration, false); assert.equal(decision.overrideBrowserWindowOptions.webPreferences.preload, undefined);
  const child = new Child(); wc.emit('did-create-window', child, { url: 'about:blank' });
  assert.equal(registry.size, 2); assert.equal(child.isDestroyed(), false);
  const id = owner.snapshot().popups[0].id; owner.focusPopup(id); assert.equal(child.focused, true);
  child.webContents.url = 'https://company-idp.test/auth?token=secret'; child.webContents.emit('did-finish-load');
  assert.equal(child.isDestroyed(), false); assert.ok(!JSON.stringify(owner.snapshot()).includes('secret'));
  owner.closePopup(id); assert.equal(owner.popups.size, 0); assert.equal(registry.size, 1); owner.dispose();
});
test('only a committed workspace/channel hands off, and stale completion cannot close a newer popup workflow', async () => {
  const { owner, wc } = fixture(); wc.url = 'https://team.slack.com/sso';
  const child = new Child(); wc.emit('did-create-window', child, { url: 'about:blank' });
  let finish; wc.loadURL = url => new Promise(resolve => { finish = () => { wc.url = url; resolve(); }; });
  child.webContents.url = 'https://app.slack.com/client/T123/C456'; child.webContents.emit('did-finish-load');
  assert.equal(child.isDestroyed(), false); assert.equal(owner.snapshot().popups[0].stage, 'finishing');
  owner.reload(); finish(); await tick(); assert.equal(child.isDestroyed(), false); assert.equal(owner.snapshot().popups[0].stage, 'open');
  wc.loadURL = Contents.prototype.loadURL; child.webContents.emit('did-finish-load'); await tick(); assert.equal(child.isDestroyed(), true); assert.equal(owner.workflow.phase, 'client_ready'); owner.dispose();
});
test('selection resizes to dynamic chrome height without loading or reloading the renderer', () => {
  const { owner, wc, children } = fixture(); owner.setSelected(true);
  assert.deepEqual(owner.view.bounds, { x: 0, y: 90, width: 1000, height: 710 }); assert.equal(children.size, 1);
  owner.setSelected(false); owner.setSelected(true); assert.equal(wc.getURL(), ''); assert.equal(wc.reloads, 0); owner.dispose(); assert.equal(children.size, 0);
});
test('dispose releases owned popup listeners/registry while preserving other consumers', async () => {
  const { owner, wc, registry, updates } = fixture(); let foreign = 0; wc.on('did-finish-load', () => foreign++);
  const child = new Child(); wc.emit('did-create-window', child, {}); const item = { cancel() { this.cancelled = true; } }; owner.downloads.add(item);
  owner.dispose(); const count = updates(); owner.dispose();
  assert.equal(owner.abort.signal.aborted, true); assert.equal(item.cancelled, true); assert.equal(child.isDestroyed(), true); assert.equal(wc.isDestroyed(), true); assert.equal(registry.size, 0); assert.equal(owner.cleanups.length, 0);
  wc.emit('did-finish-load'); await tick(); assert.equal(foreign, 1); assert.equal(updates(), count);
});
test('unsupported schemes produce a recoverable issue, while Slack deep links never call an OS handler', async () => {
  const { owner, wc } = fixture(); wc.url = 'https://team.slack.com/sso'; let blocked = false;
  wc.emit('will-redirect', { preventDefault() { blocked = true; } }, 'file:///tmp/private'); assert.equal(blocked, true); assert.equal(owner.snapshot().issue, 'navigation_blocked');
  const decision = wc.open({ url: 'slack://open?team=T123' }); assert.equal(decision.action, 'deny'); await tick(); assert.equal(wc.url, 'https://app.slack.com/client/T123'); owner.dispose();
});
test('manual Messenger setup confirmation navigates only after persistence and enables scoped navbar CSS', async () => {
  const { owner, wc } = fixture('messenger');
  assert.equal(owner.startURL(), 'https://www.facebook.com/');
  wc.url = 'https://www.facebook.com/'; wc.emit('did-finish-load'); wc.emit('did-stop-loading');
  assert.equal(owner.snapshot().setup.can_confirm, true); assert.equal(owner.snapshot().setup.compact, false);
  await owner.confirmSetup(); await tick(); assert.equal(wc.url, 'https://www.facebook.com/messages/t'); assert.equal(owner.snapshot().setup.compact, true); assert.ok(wc.lastCSS.includes('role="banner"'));
  await owner.reopenSetup(); await tick(); assert.equal(wc.url, 'https://www.facebook.com/'); assert.equal(owner.snapshot().setup.confirmed, false); assert.equal(wc.lastCSS, null); owner.dispose();
});
test('failed setup persistence and auth pages cannot activate compact mode', async () => {
  const state = new (require('../src/core/service_state').ServiceState)(); state.confirm = () => { throw new Error('disk_full'); };
  const { owner, wc } = fixture('messenger', { serviceState: state });
  wc.url = 'https://www.facebook.com/'; wc.emit('did-stop-loading');
  await assert.rejects(owner.confirmSetup(), /config_write_failed/); assert.equal(wc.url, 'https://www.facebook.com/'); assert.equal(owner.snapshot().setup.confirmed, false);
  wc.url = 'https://www.facebook.com/login.php'; wc.emit('did-finish-load'); await assert.rejects(owner.confirmSetup(), /invalid_setup/); owner.dispose();
});
test('clicking an outside chat link invokes only the system browser, without a confirmation dialog or replacing the chat', async () => {
  const { owner, wc } = fixture(); const opened = []; owner.electron.shell.openExternal = async value => opened.push(value); owner.electron.dialog.showMessageBox = () => { throw new Error('unexpected_dialog'); };
  wc.url = 'https://app.slack.com/client/T123'; wc.emit('did-finish-load');
  let prevented = false; wc.emit('will-navigate', { preventDefault() { prevented = true; } }, 'https://example.test/article'); await tick();
  assert.equal(prevented, true); assert.deepEqual(opened, ['https://example.test/article']); assert.equal(wc.url, 'https://app.slack.com/client/T123');
  assert.equal(wc.open({ url: 'http://example.test/second' }).action, 'deny'); await tick(); assert.equal(opened.length, 2); owner.dispose();
});
test('blank popup from a ready chat opens an outside destination in the browser, while an auth blank retains its flow', async () => {
  const { owner, wc } = fixture(); const opened = []; owner.electron.shell.openExternal = async url => opened.push(url);
  wc.url = 'https://app.slack.com/client/T123'; wc.emit('did-finish-load');
  const outside = new Child(); wc.emit('did-create-window', outside, { url: 'about:blank' }); let prevented = false;
  outside.webContents.emit('will-navigate', { preventDefault() { prevented = true; } }, 'https://example.test/article'); await tick();
  assert.equal(prevented, true); assert.equal(outside.isDestroyed(), true); assert.deepEqual(opened, ['https://example.test/article']);
  wc.url = 'https://team.slack.com/sso'; wc.emit('did-finish-load');
  const auth = new Child(); wc.emit('did-create-window', auth, { url: 'about:blank' }); let authPrevented = false;
  auth.webContents.emit('will-navigate', { preventDefault() { authPrevented = true; } }, 'https://company-idp.test/app/callback'); await tick();
  assert.equal(authPrevented, false); assert.equal(auth.isDestroyed(), false); assert.equal(opened.length, 1); owner.dispose();
});
test('Messenger auth popup cannot skip setup; explicit confirmation hands main view to chat and closes only finished auth windows', async () => {
  const { owner, wc } = fixture('messenger'); wc.url = 'https://www.facebook.com/'; wc.emit('did-finish-load'); wc.emit('did-stop-loading');
  const popup = new Child(); wc.emit('did-create-window', popup, { url: 'about:blank' });
  popup.webContents.url = 'https://www.facebook.com/login.php'; popup.webContents.emit('did-finish-load');
  popup.webContents.url = 'https://www.facebook.com/messages/t/123'; popup.webContents.emit('did-finish-load'); await tick();
  assert.equal(wc.url, 'https://www.facebook.com/'); assert.equal(popup.isDestroyed(), false);
  await owner.confirmSetup(); await tick(); assert.equal(wc.url, 'https://www.facebook.com/messages/t'); assert.equal(popup.isDestroyed(), true); owner.dispose();
});

test('confirming setup inside an existing Messenger conversation does not reload the view or close a call window', async () => {
  const { owner, wc } = fixture('messenger'); wc.url = 'https://www.facebook.com/messages/t/123'; wc.emit('did-finish-load'); wc.emit('did-stop-loading');
  const call = new Child('https://www.messenger.com/groupcall/123'); wc.emit('did-create-window', call, { url: 'https://www.messenger.com/groupcall/123' });
  await owner.confirmSetup(); await tick(); assert.equal(wc.url, 'https://www.facebook.com/messages/t/123'); assert.equal(call.isDestroyed(), false); assert.equal(owner.snapshot().setup.compact, true); owner.dispose();
});

test('confirmed Messenger scope blocks feed direct/redirect/API loads before setup or draft state can change', async () => {
  const { owner, wc } = fixture('messenger'); const opened = [];
  owner.electron.shell.openExternal = async url => opened.push(url);
  wc.url = 'https://www.facebook.com/messages/t/123'; wc.emit('did-finish-load'); wc.emit('did-stop-loading'); await owner.confirmSetup();
  for (const event of ['will-navigate', 'will-redirect']) {
    let blocked = false; wc.emit(event, { preventDefault() { blocked = true; } }, 'https://www.facebook.com/notifications/');
    assert.equal(blocked, true); assert.equal(owner.snapshot().setup.confirmed, true);
  }
  await owner.navigateTo('https://www.facebook.com/profile.php?id=456');
  assert.equal(wc.url, 'https://www.facebook.com/messages/t/123'); assert.equal(opened.length, 3);
  assert.equal(wc.open({ url: 'https://www.facebook.com/feed/' }).action, 'deny');
  await tick();
  assert.equal(opened.length, 4);
  assert.equal(wc.open({ url: 'https://www.facebook.com/messenger_media/?attachment_id=99&thread_id=123' }).action, 'deny');
  await tick();
  assert.equal(wc.url, 'https://www.facebook.com/messenger_media/?attachment_id=99&thread_id=123');
  assert.equal(opened.length, 4);
  assert.equal(wc.open({ url: 'https://www.messenger.com/groupcall/123' }).action, 'allow');
  const options = wc.open({ url: 'https://www.messenger.com/groupcall/123' }).overrideBrowserWindowOptions;
  assert.equal(options.parent, undefined); assert.equal(options.modal, false); assert.equal(options.alwaysOnTop, false);
  owner.dispose();
});

test('a leaked SPA route cannot reset Messenger confirmation and recovery traverses history without a reload', async () => {
  const { owner, wc } = fixture('messenger'); wc.url = 'https://www.facebook.com/messages/t/123'; wc.emit('did-finish-load'); wc.emit('did-stop-loading'); await owner.confirmSetup();
  let index = 1; let traversed = null;
  wc.navigationHistory = { getAllEntries: () => [{ url: 'https://www.facebook.com/messages/t/123' }, { url: 'https://www.facebook.com/notifications' }], getActiveIndex: () => index, goToIndex: n => { traversed = n; index = n; } };
  wc.url = 'https://www.facebook.com/notifications'; wc.emit('did-navigate-in-page', {}, wc.url, true);
  assert.equal(traversed, 0); assert.equal(wc.reloads, 0); assert.equal(owner.snapshot().setup.confirmed, true); assert.equal(owner.workflow.phase, 'client_ready'); owner.dispose();
});
