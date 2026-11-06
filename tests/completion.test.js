'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PreferencesStore, DEFAULTS } = require('../src/core/preferences_store');
const { PermissionStore } = require('../src/core/permission_store');
const { defaultInstances, normalizeSlackWorkspace } = require('../src/core/services');
const { fingerprint, backupAndReset } = require('../src/core/atomic_json');
const { Workflow, routeStage, navigationDecision, canHandoff } = require('../src/core/workflow');
const { SessionPolicy, permissionKeys } = require('../src/main/session_policy');
const { DownloadRegistry, safeFilename } = require('../src/main/download_registry');
const { installIPC } = require('../src/main/ipc');
function temporary(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_unit_')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
test('preferences migrate once, persist language and reset without clearing language', t => {
  const file = path.join(temporary(t), 'prefs.json'); const prefs = new PreferencesStore(file);
  assert.deepEqual(prefs.migrate({ theme: 'black', language: 'en' }), { ...DEFAULTS, theme: 'black', language: 'en' });
  prefs.migrate({ theme: 'light', language: 'vi' }); assert.equal(prefs.snapshot().theme, 'black');
  prefs.update({ slack_workspace_url: 'my-team.slack.com' }); assert.equal(new PreferencesStore(file).snapshot().slack_workspace_url, 'https://my-team.slack.com/');
  assert.deepEqual(prefs.reset(), { ...DEFAULTS, language: 'en' });
});
test('invalid preferences and failed writes leave in-memory and disk values intact', t => {
  const dir = temporary(t); const file = path.join(dir, 'prefs.json'); const prefs = new PreferencesStore(file); prefs.update({ theme: 'dark' });
  const before = fs.readFileSync(file, 'utf8');
  for (const patch of [{ partition: 'bad' }, { theme: 'unknown' }, { language: null }, { slack_workspace_url: 'https://evil.test' }]) assert.throws(() => prefs.update(patch));
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  fs.renameSync(file, `${file}.original`); fs.mkdirSync(file);
  assert.throws(() => prefs.update({ theme: 'light' })); assert.equal(prefs.snapshot().theme, 'dark');
});
test('corrupt metadata is preserved; recovery requires unchanged regular file and saves exact backup', t => {
  const dir = temporary(t); const file = path.join(dir, 'prefs.json'); fs.writeFileSync(file, '{broken');
  assert.throws(() => new PreferencesStore(file), /recovery_required/); const hash = fingerprint(file);
  fs.writeFileSync(file, '{changed'); assert.throws(() => backupAndReset(file, hash, DEFAULTS), /configuration_changed/); assert.equal(fs.readFileSync(file, 'utf8'), '{changed');
  const backup = backupAndReset(file, fingerprint(file), DEFAULTS); assert.equal(fs.readFileSync(backup, 'utf8'), '{changed'); assert.deepEqual(new PreferencesStore(file).snapshot(), DEFAULTS);
  const link = path.join(dir, 'link.json'); fs.symlinkSync(file, link); assert.throws(() => backupAndReset(link, fingerprint(file), DEFAULTS)); assert.throws(() => new PreferencesStore(link), /recovery_required/);
});
test('Slack hint canonicalizes known workspace/client routes and rejects auth/foreign/query URLs', () => {
  assert.equal(normalizeSlackWorkspace('https://app.slack.com/client/T123/C456'), 'https://app.slack.com/client/T123'); assert.equal(normalizeSlackWorkspace(''), null);
  assert.equal(normalizeSlackWorkspace('https://app.slack.com'), null);
  for (const value of ['https://slack.com.evil.test', 'https://user:pass@team.slack.com', 'http://team.slack.com', 'https://team.slack.com/sso?token=secret', 'https://app.slack.com/client/T123?token=x', 'https://team.slack.com/path', 'https://api.slack.com', 'https://team.slack.com:444']) assert.throws(() => normalizeSlackWorkspace(value));
});
test('Messenger permits post-login save-info setup and exposes explicit return; normal chat escapes open the default browser', () => {
  const w = new Workflow('messenger');
  assert.equal(routeStage('messenger', 'https://www.facebook.com/login.php'), 'auth');
  w.committed('https://www.facebook.com/login.php'); assert.equal(w.phase, 'authenticating');
  assert.equal(navigationDecision('messenger', 'https://www.facebook.com/', { phase: w.phase, setupConfirmed: false }), 'allow');
  w.committed('https://www.facebook.com/'); assert.equal(w.phase, 'post_login_setup');
  w.committed('https://www.facebook.com/messages/t/123'); assert.equal(w.phase, 'client_ready');
  assert.equal(navigationDecision('messenger', 'https://www.facebook.com/', { phase: w.phase, currentURL: 'https://www.facebook.com/messages/t/123', redirected: true }), 'external');
  assert.equal(navigationDecision('messenger', 'https://www.facebook.com/', { phase: w.phase, currentURL: 'https://www.facebook.com/messages/t/123' }), 'external');
});
test('auth popups retain about:blank/IdP ownership; only committed Slack client is handoff eligible', () => {
  assert.equal(navigationDecision('slack', 'about:blank', { auxiliary: true }), 'allow');
  assert.equal(navigationDecision('slack', 'https://company-idp.test/login', { phase: 'authenticating' }), 'allow');
  assert.equal(navigationDecision('slack', 'https://company-idp.test/login', { phase: 'client_ready' }), 'external');
  assert.equal(canHandoff('slack', 'https://app.slack.com/client/T123', 'https://team.slack.com/'), true);
  for (const url of ['about:blank', 'https://team.slack.com/sso', 'https://app.slack.com/huddle/T', 'https://app.slack.com.evil.test/client/T']) assert.equal(canHandoff('slack', url, ''), false);
  const w = new Workflow('slack'); for (let i = 0; i < 40; i++) w.committed('https://company-idp.test/login?token=secret', 'popup'); assert.equal(w.trace.length, 32); assert.ok(!JSON.stringify(w).includes('secret'));
});
test('media permission types remain distinct and revocation persists per instance/origin', t => {
  assert.deepEqual(permissionKeys('media', { mediaTypes: ['audio'] }), ['media:audio']); assert.deepEqual(permissionKeys('media', {}), []);
  const file = path.join(temporary(t), 'permissions.json'); const store = new PermissionStore(file);
  store.set('default_slack', 'https://app.slack.com', ['media:audio'], 'allow');
  assert.equal(store.decision('default_slack', 'https://app.slack.com', 'media:video'), undefined);
  assert.equal(store.decision('default_messenger', 'https://app.slack.com', 'media:audio'), undefined);
  store.revoke(store.snapshot()[0].id); assert.deepEqual(new PermissionStore(file).snapshot(), []);
  assert.throws(() => store.set('default_slack', 'https://evil.test', ['media:audio'], 'allow'));
});
test('audio consent cannot grant camera; concurrent identical permission prompts coalesce', async () => {
  let request, check, prompts = 0, finish;
  const instance = defaultInstances().find(i => i.service_id === 'slack'); const wc = { getURL: () => 'https://app.slack.com/client/T123' }; const owner = { instance, isLive: () => true };
  const ses = { getUserAgent: () => 'Chrome/156', setUserAgent() {}, setPermissionCheckHandler(h) { check = h; }, setPermissionRequestHandler(h) { request = h; }, setDevicePermissionHandler() {}, setDisplayMediaRequestHandler() {}, on() {} };
  new SessionPolicy({ session: { fromPartition: () => ses }, window: {}, resolveOwner: w => w === wc ? owner : null, dialog: { showMessageBox() { prompts++; return new Promise(resolve => { finish = resolve; }); } } }).get(instance);
  const ask = () => new Promise(resolve => request(wc, 'media', resolve, { requestingUrl: wc.getURL(), mediaTypes: ['audio'] }));
  const first = ask(), second = ask(); assert.equal(prompts, 1); finish({ response: 1 }); assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(check(wc, 'media', 'https://app.slack.com', { mediaType: 'audio' }), true);
  assert.equal(check(wc, 'media', 'https://app.slack.com', { mediaType: 'video' }), false);
});
class Item extends EventEmitter {
  constructor(file, name = 'report.pdf') { super(); this.file = file; this.name = name; this.cancelled = false; }
  getFilename() { return this.name; } setSaveDialogOptions(value) { this.options = value; }
  getReceivedBytes() { return 100; } getTotalBytes() { return 100; } getSavePath() { return this.file; }
  cancel() { this.cancelled = true; this.emit('done', {}, 'cancelled'); }
}
test('download registry exposes IDs only, permits completed files and rejects missing or executable files', async t => {
  const dir = temporary(t); const file = path.join(dir, 'report.pdf'); fs.writeFileSync(file, 'fixture'); let opened, revealed;
  const registry = new DownloadRegistry({ directory: dir, shell: { openPath: async p => { opened = p; return ''; }, showItemInFolder: p => { revealed = p; } } });
  const owner = { tab: { id: 'tab' }, instance: { service_id: 'slack' }, downloads: new Set() }; const item = new Item(file); const id = registry.track(owner, item);
  assert.throws(() => registry.reveal(id), /not_ready/); item.emit('done', {}, 'completed'); assert.equal(owner.downloads.size, 0);
  assert.ok(!JSON.stringify(registry.snapshot()).includes(dir)); await registry.open(id); registry.reveal(id); assert.equal(opened, file); assert.equal(revealed, file);
  fs.unlinkSync(file); await assert.rejects(registry.open(id), /missing/);
  const executable = path.join(dir, 'unsafe.command'); fs.writeFileSync(executable, 'fixture'); const second = new Item(executable); const sid = registry.track(owner, second); second.emit('done', {}, 'completed'); await assert.rejects(registry.open(sid), /blocked_file_type/);
  registry.clearCompleted(); assert.equal(fs.existsSync(executable), true); assert.deepEqual(registry.snapshot(), []);
});
test('download cancellation releases owner tracking and disposal cancels only active items', t => {
  const registry = new DownloadRegistry({ directory: temporary(t), shell: {} }); const owner = { tab: { id: 'x' }, instance: { service_id: 'slack' }, downloads: new Set() };
  const item = new Item('unused'); const id = registry.track(owner, item); registry.cancel(id); assert.equal(item.cancelled, true); assert.equal(owner.downloads.size, 0); assert.equal(registry.snapshot()[0].status, 'cancelled');
  const second = new Item('unused'); registry.track(owner, second); registry.dispose(); assert.equal(second.cancelled, true); assert.deepEqual(registry.snapshot(), []);
  assert.equal(safeFilename('../../a.pdf'), 'a.pdf'); assert.equal(safeFilename('CON.txt'), 'download_CON.txt'); assert.ok(!safeFilename('a\u202eb.txt').includes('\u202e'));
});
test('IPC roles deny remote/subframe privilege escalation and never accept arbitrary download paths', async () => {
  let handle; const ipcMain = { handle(_name, fn) { handle = fn; }, removeHandler() {} }; const frame = { url: 'file:///shell' }; const shell = { mainFrame: frame }; const engine = { snapshot: () => ({ tabs: [] }) }; let dispatches = 0;
  const ipc = installIPC({ ipcMain, shellContents: shell, shellURL: frame.url, engine, dispatch: () => { dispatches++; return {}; } });
  const sf = { url: 'file:///settings' }; const settings = { mainFrame: sf }; ipc.register(settings, 'settings', sf.url, () => {});
  assert.equal((await handle({ sender: shell, senderFrame: frame }, { action: 'download_open', id: 'opaque' })).ok, false);
  assert.equal((await handle({ sender: settings, senderFrame: sf }, { action: 'layout', height: 50 })).ok, false);
  assert.equal((await handle({ sender: settings, senderFrame: { url: sf.url } }, { action: 'preferences_get' })).ok, false);
  assert.equal((await handle({ sender: settings, senderFrame: sf }, { action: 'preferences_get' })).ok, true); assert.equal(dispatches, 1);
  assert.equal((await handle({ sender: settings, senderFrame: sf }, { action: 'download_open', id: 'x', path: '/etc/passwd' })).ok, false); ipc();
});
test('Slack protocol links remain web-only and cannot smuggle arbitrary hosts or parameters', () => {
  const { slackClientURL } = require('../src/core/services');
  assert.equal(slackClientURL('slack://open?team=T123'), 'https://app.slack.com/client/T123');
  assert.equal(slackClientURL('slack://channel?team=T123&id=C456'), 'https://app.slack.com/client/T123/C456');
  for (const url of ['slack://open', 'slack://file?team=T123&id=F123', 'slack://open?team=T123&token=secret', 'slack://open?team=T1&team=T2', 'slack://user@open?team=T123', 'slack://channel?team=T123&id=https://evil.test', 'slack://open/path?team=T123']) assert.equal(slackClientURL(url), null);
  assert.equal(canHandoff('slack', 'https://app.slack.com/client/T123/huddle', ''), false);
});
