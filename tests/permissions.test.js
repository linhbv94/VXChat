'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SessionPolicy } = require('../src/main/session_policy');
const { defaultInstances } = require('../src/core/services');

test('permissions deny unknown/iframe/origin spoofing and require explicit consent; closed owners cannot gain grants', async () => {
  const handlers = {}; let prompts = 0; let response = 1; let live = true;
  const ses = { getUserAgent: () => 'Chrome/156 Electron/45 VXChat/0.2', setUserAgent() {},
    setPermissionRequestHandler: h => { handlers.request = h; }, setPermissionCheckHandler: h => { handlers.check = h; },
    setDevicePermissionHandler: h => { handlers.device = h; }, setDisplayMediaRequestHandler: h => { handlers.display = h; }, on() {}
  };
  const wc = { getURL: () => 'https://app.slack.com/client/T' };
  const instance = defaultInstances().find(i => i.service_id === 'slack');
  const owner = { instance, isLive: () => live };
  const policy = new SessionPolicy({ session: { fromPartition: () => ses }, dialog: { async showMessageBox() { prompts++; return { response }; } }, window: {}, resolveOwner: x => x === wc ? owner : null, downloadsPath: '/tmp' });
  policy.get(instance);
  const request = (permission, details, contents = wc) => new Promise(resolve => handlers.request(contents, permission, resolve, details));
  assert.equal(handlers.check(wc, 'notifications', 'https://app.slack.com', {}), false);
  for (const [p, d, w] of [
    ['geolocation', { requestingUrl: wc.getURL() }, wc],
    ['media', { requestingUrl: 'https://app.slack.com', isMainFrame: false }, wc],
    ['notifications', { requestingUrl: 'https://slack.com.evil.test' }, wc],
    ['notifications', { requestingUrl: 'https://app.slack.com' }, {}]
  ]) assert.equal(await request(p, d, w), false);
  assert.equal(prompts, 0);
  assert.equal(await request('notifications', { requestingUrl: wc.getURL() }), true); assert.equal(prompts, 1);
  assert.equal(handlers.check(wc, 'notifications', 'https://app.slack.com', {}), true);
  response = 0; assert.equal(await request('media', { requestingUrl: wc.getURL() }), false);
  assert.equal(handlers.device(), false); handlers.display({}, result => assert.deepEqual(result, {}));
  live = false; assert.equal(await request('notifications', { requestingUrl: wc.getURL() }), false);
});
test('screen capture requires top frame, user gesture, explicit source and a still-live owner', async () => {
  let handler; let live = true; let chosen = null; let pickerCalls = 0;
  const instance = defaultInstances()[0]; const frame = {}; const wc = { mainFrame: frame, getURL: () => 'https://www.facebook.com/messages/t' };
  const owner = { instance, isLive: () => live };
  const ses = { getUserAgent: () => 'Chrome/156', setUserAgent() {}, setPermissionCheckHandler() {}, setPermissionRequestHandler() {}, setDevicePermissionHandler() {}, setDisplayMediaRequestHandler(h) { handler = h; }, on() {} };
  const policy = new SessionPolicy({ session: { fromPartition: () => ses }, dialog: {}, window: {}, resolveOwner: x => x === wc ? owner : null, downloadsPath: '/tmp', contentsFromFrame: f => f === frame ? wc : null, selectDisplaySource: async () => { pickerCalls++; return chosen; } });
  policy.get(instance);
  const base = { frame, securityOrigin: 'https://www.facebook.com', userGesture: true, videoRequested: true, audioRequested: true };
  const request = options => new Promise(resolve => handler({ ...base, ...options }, resolve));
  assert.deepEqual(await request({ userGesture: false }), {}); assert.equal(pickerCalls, 0);
  assert.deepEqual(await request({ frame: {} }), {}); assert.equal(pickerCalls, 0);
  assert.deepEqual(await request({ securityOrigin: 'https://evil.test' }), {});
  assert.deepEqual(await request({}), {}); // Cancel.
  chosen = { id: 'window:fixture', name: 'Fixture' };
  assert.deepEqual(await request({}), { video: chosen }); assert.equal(owner.mediaGranted, true);
  live = false; assert.deepEqual(await request({}), {});
});
test('permission consent cannot survive an origin change while the native prompt is pending', async () => {
  let request; let finish; let url = 'https://app.slack.com/client/T';
  const wc = { getURL: () => url }; const instance = defaultInstances().find(i => i.service_id === 'slack');
  const owner = { instance, isLive: () => true };
  const ses = { getUserAgent: () => 'Chrome/156', setUserAgent() {}, setPermissionCheckHandler() {}, setPermissionRequestHandler(h) { request = h; }, setDevicePermissionHandler() {}, setDisplayMediaRequestHandler() {}, on() {} };
  new SessionPolicy({ session: { fromPartition: () => ses }, dialog: { showMessageBox: () => new Promise(resolve => { finish = resolve; }) }, window: {}, resolveOwner: x => x === wc ? owner : null, downloadsPath: '/tmp' }).get(instance);
  const result = new Promise(resolve => request(wc, 'media', resolve, { requestingUrl: url, mediaTypes: ['audio'] }));
  url = 'https://evil.test/'; finish({ response: 1 });
  assert.equal(await result, false);
});
