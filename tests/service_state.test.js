'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ServiceState, validateServiceState, initialServiceState, workspaceID } = require('../src/core/service_state');
const { defaultInstances, popupDisposition } = require('../src/core/services');
const { compactAllowed, MessengerPresentation } = require('../src/main/messenger_presentation');
const { navigationDecision } = require('../src/core/workflow');
const messenger = defaultInstances().find(i => i.service_id === 'messenger');
const slack = defaultInstances().find(i => i.service_id === 'slack');
function temporary(t) { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_setup_unit_')); t.after(() => fs.rmSync(p, { recursive: true, force: true })); return p; }
test('first Messenger launch stays on Facebook home until explicit confirmation; restart remembers setup, auth invalidates it', t => {
  const file = path.join(temporary(t), 'service.json'); const s = new ServiceState(file);
  assert.equal(s.startURL(messenger), 'https://www.facebook.com/');
  s.observe(messenger, 'https://www.facebook.com/messages/t/123'); assert.equal(s.entry(messenger.id).setup_confirmed, false);
  s.confirm(messenger); assert.equal(new ServiceState(file).startURL(messenger), 'https://www.facebook.com/messages/t');
  s.observe(messenger, 'https://www.facebook.com/checkpoint/123'); assert.equal(s.entry(messenger.id).setup_confirmed, false); assert.equal(s.startURL(messenger), 'https://www.facebook.com/');
});
test('Slack remembers only validated workspace ID after client navigation; arbitrary links and tokens are not persisted', t => {
  const file = path.join(temporary(t), 'service.json'); const s = new ServiceState(file);
  assert.equal(s.startURL(slack), 'https://app.slack.com/client');
  s.observe(slack, 'https://app.slack.com/client/T123/C456?token=secret#thread');
  assert.equal(new ServiceState(file).startURL(slack), 'https://app.slack.com/client/T123'); assert.ok(!fs.readFileSync(file, 'utf8').includes('secret')); assert.ok(!fs.readFileSync(file, 'utf8').includes('C456'));
  for (const url of ['https://app.slack.com.evil.test/client/TBAD', 'https://app.slack.com/client/%54BAD', 'https://user:pass@app.slack.com/client/TBAD', 'https://app.slack.com:444/client/TBAD', 'https://team.slack.com/sso']) { s.observe(slack, url); assert.equal(workspaceID(url), null); }
  assert.equal(s.startURL(slack), 'https://app.slack.com/client/T123');
  assert.equal(s.startURL(slack, 'https://another-team.slack.com/'), 'https://another-team.slack.com/');
});
test('service-state validation and write failures preserve confirmed state; invalid config is never silently reset', t => {
  const dir = temporary(t); const file = path.join(dir, 'service.json'); const s = new ServiceState(file); s.confirm(messenger);
  fs.renameSync(file, file + '.original'); fs.mkdirSync(file); assert.throws(() => s.resetSetup(messenger)); assert.equal(s.entry(messenger.id).setup_confirmed, true);
  for (const modify of [v => v.entries.push(v.entries[0]), v => v.entries[0].cookie = 'x', v => v.entries[1].workspace_id = 'T123', v => v.entries[0].setup_confirmed = 'true']) { const v = initialServiceState(); modify(v); assert.throws(() => validateServiceState(v)); }
  const corrupt = path.join(dir, 'broken.json'); fs.writeFileSync(corrupt, '{broken'); assert.throws(() => new ServiceState(corrupt), /recovery_required/); assert.equal(fs.readFileSync(corrupt, 'utf8'), '{broken');
});
test('navbar compact mode requires explicit setup plus canonical Messenger conversation URL', () => {
  assert.equal(compactAllowed('https://www.facebook.com/messages/t/123', true), true);
  for (const url of ['https://www.facebook.com/', 'https://www.facebook.com/login.php', 'https://www.facebook.com/checkpoint/', 'https://facebook.com.evil.test/messages/t/123', 'https://www.facebook.com:444/messages/t/123']) assert.equal(compactAllowed(url, true), false);
  assert.equal(compactAllowed('https://www.facebook.com/messages/t/123', false), false);
  assert.equal(navigationDecision('messenger', 'https://www.facebook.com/', { phase: 'client_ready', currentURL: 'https://www.facebook.com/messages/t/123', setupConfirmed: false }), 'allow');
});
test('late CSS insertion is removed if setup is revoked before it resolves', async () => {
  let finish; const removed = [];
  const contents = { isDestroyed: () => false, insertCSS: () => new Promise(resolve => { finish = resolve; }), removeInsertedCSS: async key => { removed.push(key); } };
  const presentation = new MessengerPresentation(contents, () => true);
  const enabling = presentation.sync(true); await presentation.sync(false); finish('late-key'); await enabling; assert.deepEqual(removed, ['late-key']); assert.equal(presentation.key, null);
});
test('normal HTTP and HTTPS links open externally; auth redirects and non-web schemes stay guarded', () => {
  for (const url of ['https://example.test/article', 'http://example.test/article']) {
    assert.equal(navigationDecision('slack', url, { phase: 'client_ready', currentURL: 'https://app.slack.com/client/T123' }), 'external');
    assert.equal(popupDisposition('slack', url, { phase: 'client_ready' }), 'external');
  }
  assert.equal(navigationDecision('slack', 'https://company-idp.test/auth', { phase: 'authenticating' }), 'allow');
  for (const url of ['javascript:alert(1)', 'file:///tmp/private', 'data:text/html,x', 'https://user:secret@example.test']) assert.equal(navigationDecision('slack', url, { phase: 'client_ready' }), 'block');
});
test('setup and native menu commands route through their dedicated handlers rather than missing engine methods', async () => {
  let handler; const calls = []; const { installIPC } = require('../src/main/ipc');
  const frame = { url: 'file:///shell.html' }; const contents = { mainFrame: frame };
  const dispose = installIPC({ ipcMain: { handle(_name, fn) { handler = fn; }, removeHandler() {} }, shellContents: contents, shellURL: frame.url, engine: { setup: async (id, confirmed) => calls.push([id, confirmed]), snapshot: () => ({ tabs: [] }) }, dispatch: async command => { calls.push(command.action); return {}; } });
  for (const action of ['confirm_setup', 'setup_reset']) assert.equal((await handler({ sender: contents, senderFrame: frame }, { action, tab_id: 'tab' })).ok, true);
  assert.equal((await handler({ sender: contents, senderFrame: frame }, { action: 'app_menu' })).ok, true);
  assert.deepEqual(calls, [['tab', true], ['tab', false], 'app_menu']); dispose();
});
