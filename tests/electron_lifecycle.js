'use strict';

// Hermetic native test: temporary Chromium profile and synthetic documents only.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const electron = require('electron');
const { app, BaseWindow, session } = electron;
const { StateStore } = require('../src/core/state_store');
const { TabEngine } = require('../src/core/tab_engine');
const { ContentOwner } = require('../src/main/content_owner');
const { SessionPolicy } = require('../src/main/session_policy');
const temporary = process.env.VXCHAT_FIXTURE_DIR;
if (!temporary) throw new Error('Run via npm run test:electron');
app.setPath('userData', temporary);
process.on('uncaughtException', error => { console.error(error.stack); app.exit(1); });
process.on('unhandledRejection', error => { console.error(error?.stack || error); app.exit(1); });
let engine; let window; let failed = false;
const timeout = setTimeout(() => { console.error('Electron lifecycle fixture timed out.'); app.exit(1); }, 30000);
const fixture = 'data:text/html,' + encodeURIComponent('<!doctype html><title>Fixture</title><textarea id="draft"></textarea><p>VXChat local fixture</p>');
app.whenReady().then(async () => {
  window = new BaseWindow({ width: 800, height: 600, show: false });
  const registry = new Map(); const pending = [];
  const testElectron = { ...electron, dialog: { showMessageBox: async () => ({ response: 1 }) } };
  const policy = new SessionPolicy({ session, dialog: testElectron.dialog, window, resolveOwner: wc => registry.get(wc), downloadsPath: temporary });
  engine = new TabEngine({ store: new StateStore(path.join(temporary, 'state.json')), createOwner: args => {
    const owner = new ContentOwner({ ...args, electron: testElectron, window, sessionPolicy: policy, register: (wc, o) => registry.set(wc, o), unregister: wc => registry.delete(wc) });
    owner.load = () => pending.push(owner.view.webContents.loadURL(fixture));
    return owner;
  } });
  engine.start(); await Promise.all(pending.splice(0));
  const a = engine.state.tabs.find(t => t.instance_id === 'default_chatgpt').id;
  const b = await engine.add('chatgpt'); await Promise.all(pending.splice(0));
  const wa = engine.owners.get(a).view.webContents; const wb = engine.owners.get(b).view.webContents;
  assert.notEqual(wa.id, wb.id); assert.equal(wa.session, wb.session);
  assert.notEqual(wa.session, engine.owners.get(engine.state.tabs.find(t => t.instance_id === 'default_slack').id).view.webContents.session);
  const preferences = wa.getLastWebPreferences();
  assert.equal(preferences.nodeIntegration, false); assert.equal(preferences.contextIsolation, true); assert.equal(preferences.sandbox, true); assert.equal(preferences.preload, undefined);
  await wa.executeJavaScript('document.getElementById("draft").value="draft A"');
  await wb.executeJavaScript('document.getElementById("draft").value="draft B"');
  for (let i = 0; i < 20; i++) await engine.select(i % 2 ? a : b);
  assert.equal(await wa.executeJavaScript('document.getElementById("draft").value'), 'draft A');
  assert.equal(await wb.executeJavaScript('document.getElementById("draft").value'), 'draft B');
  const bDestroyed = once(wb, 'destroyed');
  await engine.close(b); await bDestroyed; assert.equal(wb.isDestroyed(), true); assert.equal(wa.isDestroyed(), false);
  assert.equal(await wa.executeJavaScript('document.getElementById("draft").value'), 'draft A');
  const owner = engine.owners.get(a);
  const popupCreated = new Promise(resolve => wa.once('did-create-window', resolve));
  await wa.executeJavaScript('window.open("about:blank"); null', true); const popup = await popupCreated;
  assert.equal(owner.popups.size, 1);
  const aDestroyed = once(wa, 'destroyed');
  await engine.close(a); await aDestroyed; assert.equal(popup.isDestroyed(), true); assert.equal(wa.isDestroyed(), true);
  const remaining = [...engine.owners.values()].map(o => o.view.webContents);
  const destroyed = remaining.map(wc => once(wc, 'destroyed'));
  engine.dispose(); await Promise.all(destroyed); assert.ok(remaining.every(wc => wc.isDestroyed())); assert.equal(registry.size, 0);
  console.log(JSON.stringify({ result: 'PASS', electron: process.versions.electron, chromium: process.versions.chrome, independent_ai_views: true, shared_ai_session: true, draft_survived_20_switches: true, popup_and_contents_disposed: true, real_profiles_used: false }));
}).catch(error => {
  console.error(error.stack); failed = true;
}).finally(() => {
  clearTimeout(timeout);
  if (engine) engine.dispose();
  if (window && !window.isDestroyed()) window.destroy();
  app.exit(failed ? 1 : 0);
});
