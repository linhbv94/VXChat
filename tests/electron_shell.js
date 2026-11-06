'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const electron = require('electron');
const { app, webContents, Menu, BaseWindow, session } = electron;
const memorySamples = [];
const sampleMemory = label => { const metrics = app.getAppMetrics(); memorySamples.push({ label, measured_at:new Date().toISOString(), process_count:metrics.length, working_set_kib:metrics.reduce((n,m) => n + (m.memory?.workingSetSize || 0),0), processes:metrics.map(m => ({ pid:m.pid,type:m.type,memory:m.memory })) }); };
const { initialState } = require('../src/core/state_store');
const temporary = process.env.VXCHAT_FIXTURE_DIR;
if (!temporary) throw new Error('Run via npm run test:shell');
process.on('uncaughtException', error => { console.error(error.stack); app.exit(1); });
process.on('unhandledRejection', error => { console.error(error?.stack || error); app.exit(1); });
const state = { ...initialState(), tabs: [], active_tab_id: null };
fs.writeFileSync(path.join(temporary, 'tabs_state_v2.json'), JSON.stringify(state));
process.env.VXCHAT_QA_PROFILE = temporary;
let failed = false; let phase = 'startup';
const timeout = setTimeout(() => { console.error(JSON.stringify({ error: 'shell_fixture_timeout', phase, contents: webContents.getAllWebContents().map(w => ({ loading: w.isLoading(), url: w.getURL() })) })); app.exit(1); }, 20000);
const { ready } = require('../src/main/app');
assert.ok(ready, 'Engine did not acquire the fixture instance lock');
ready.then(async () => {
  electron.dialog.showMessageBox = async win => {
    if (win.webContents && !win.webContents.isDestroyed()) {
      try { console.error(JSON.stringify({image_diagnostic:await win.webContents.executeJavaScriptInIsolatedWorld(1025,[{code:'({type:document.contentType,scheme:location.protocol,img:!!document.querySelector("img"),width:document.querySelector("img")?.naturalWidth,complete:document.querySelector("img")?.complete})'}])})); } catch {}
    }
    throw new Error('Unexpected native dialog in synthetic QA');
  };
  phase = 'ready';
  const contents = webContents.getAllWebContents();
  assert.equal(contents.length, 1, 'Empty fixture must create exactly the local shell');
  const shell = contents[0];
  sampleMemory('empty_shell');
  assert.ok(shell);
  // app.ready resolves after loadFile; did-finish-load has already fired.
  // isLoading may remain true briefly for subresources and cannot gate this event again.
  phase = 'state_ipc';
  const result = await shell.executeJavaScript('window.vxchat.command({ action: "state" })');
  assert.equal(result.ok, true); assert.deepEqual(result.state.tabs, []);
  phase = 'invalid_ipc';
  const rejected = await shell.executeJavaScript('window.vxchat.command({ action: "add", service_id: "slack", partition: "persist:injected" })');
  assert.equal(rejected.ok, false);
  phase = 'disabled_provider';
  const disabled = await shell.executeJavaScript('window.vxchat.command({ action: "add", service_id: "gemini" })');
  assert.equal(disabled.ok, false);
  assert.ok(Menu.getApplicationMenu());
  assert.equal(webContents.getAllWebContents().length, 1); // No provider or real account opened.
  phase = 'teardown';
  phase = 'chrome_geometry';
  const geometry = await shell.executeJavaScript(`(() => {
    const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; };
    return { titlebar:box('#titlebar'), glyph:box('[data-vx-titlebar-brand] > svg'), name:box('[data-vx-titlebar-name]'), settings:box('[data-vx-titlebar-settings]'), tabbar:box('.nav-bar'), viewport:innerWidth, locationIsEditable:document.querySelector('#page-location').isContentEditable };
  })()`);
  assert.equal(geometry.titlebar.height, 32); assert.equal(geometry.tabbar.height, 36);
  if (process.platform === 'darwin') { assert.equal(geometry.glyph.x, 82); assert.equal(geometry.name.x, 104); assert.equal(geometry.viewport - geometry.settings.x - geometry.settings.width, 12); }
  assert.equal(geometry.settings.width, 28); assert.equal(geometry.locationIsEditable, false);
  const primaryWindow = BaseWindow.getAllWindows().find(w => w.getTitle() === 'VXChat');
  primaryWindow.setContentSize(800, 600);
  // Query the rendered view after native resize, never synthesize metrics from tokens.
  let compactGeometry;
  for (let n = 0; n < 30; n++) {
    compactGeometry = await shell.executeJavaScript(`(() => { const r = document.querySelector('[data-vx-titlebar-settings]').getBoundingClientRect(); return { width:innerWidth, settingsRight:r.right }; })()`);
    if (compactGeometry.width === 800) break; await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(compactGeometry.width, 800); if (process.platform === 'darwin') assert.equal(compactGeometry.settingsRight, 788);
  phase = 'settings_window';
  const nextPage = () => new Promise(resolve => app.once('web-contents-created', (_e, contents) => contents.once('did-finish-load', () => resolve(contents))));
  const settingsReady = nextPage(); await shell.executeJavaScript('window.vxchat.command({ action: "settings" })');
  const settings = await settingsReady;
  assert.equal((await settings.executeJavaScript('window.vxchat.command({ action: "preferences_get" })')).ok, true);
  const settingsUI = await settings.executeJavaScript(`(() => ({
    hasShortcutsTab: Boolean(document.querySelector('[data-tab="shortcuts"]')),
    hasAccountsCard: Boolean(document.querySelector('#accounts-title')),
    appShortcutRows: document.querySelectorAll('#shortcuts-app-rows tr').length,
    tabShortcutRows: document.querySelectorAll('#shortcuts-tabstrip-rows tr').length
  }))()`);
  assert.equal(settingsUI.hasShortcutsTab, true);
  assert.equal(settingsUI.hasAccountsCard, true);
  assert.ok(settingsUI.appShortcutRows >= 6);
  assert.ok(settingsUI.tabShortcutRows >= 3);
  assert.equal((await settings.executeJavaScript('window.vxchat.command({action:"zoom_update",instance_id:"default_chatgpt",factor:1.25})')).ok,true);
  assert.equal((await settings.executeJavaScript('window.vxchat.command({action:"preferences_update",patch:{ask_download_location:false}})')).ok,true);
  const browserPrefs = await settings.executeJavaScript('window.vxchat.command({action:"preferences_get"})');
  assert.equal(browserPrefs.preferences.zoom_levels.default_chatgpt,1.25); assert.equal(browserPrefs.preferences.ask_download_location,false);
  assert.equal((await settings.executeJavaScript('window.vxchat.command({action:"preferences_update",patch:{download_directory:"/tmp/injected"}})')).ok,false);
  assert.equal((await settings.executeJavaScript('window.vxchat.command({action:"update_state"})')).update.state,'unsupported');
  await settings.executeJavaScript('window.vxchat.command({action:"preferences_update",patch:{language:"en"}})');
  assert.ok(await settings.executeJavaScript('document.getElementById("browser-controls").textContent.includes("Ask where to save")'));
  await settings.executeJavaScript('window.vxchat.command({action:"preferences_update",patch:{language:"vi"}})');
  const settingsClosed = once(settings, 'destroyed'); await settings.executeJavaScript('window.vxchat.command({ action: "window_close" })').catch(() => {}); await settingsClosed;
  phase = 'download_cue_feedback';
  const cueTest = await shell.executeJavaScript(`(() => {
    const btn = document.getElementById('downloads-btn');
    const icon = document.getElementById('downloads-icon');
    const live = document.getElementById('downloads-live');
    const initHasClass = btn.classList.contains('has-completed');
    if (typeof downloadTracker !== 'undefined' && downloadTracker) {
      downloadTracker.update([{ id: 'test_dl_1', status: 'downloading', name: 'demo.png' }]);
      downloadTracker.update([{ id: 'test_dl_1', status: 'completed', name: 'demo.png' }]);
    }
    const afterCueHasClass = btn.classList.contains('has-completed');
    const iconText = icon?.textContent;
    const liveText = live?.textContent;
    btn.click();
    const afterClickHasClass = btn.classList.contains('has-completed');
    const iconAfter = icon?.textContent;
    return { initHasClass, afterCueHasClass, iconText, liveText, afterClickHasClass, iconAfter };
  })()`);
  assert.equal(cueTest.initHasClass, false);
  assert.equal(cueTest.afterCueHasClass, true);
  assert.equal(cueTest.iconText, '✓');
  assert.ok(cueTest.liveText.length > 0);
  assert.equal(cueTest.afterClickHasClass, false);
  assert.equal(cueTest.iconAfter, '↓');
  phase = 'messenger_setup';
  const partition = session.fromPartition('persist:service-messenger');
  await partition.protocol.handle('https', request => new URL(request.url).pathname === '/fixture_image.png' ? new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'), { headers:{'content-type':'image/png'} }) : new Response('<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}header{position:fixed;top:0;height:56px}.chat-frame{position:absolute;top:56px;bottom:0;width:100%}.chat-shell{display:flex;height:100%}nav{width:200px}main{display:flex;flex-direction:column;flex:1}textarea{margin-top:auto;height:40px}</style></head><body><header role="banner" id="global">Facebook navigation</header><div class="chat-frame"><div class="chat-shell"><nav role="navigation"><a href="/messages/t/123">Synthetic thread</a></nav><main role="main">Synthetic Messenger fixture<textarea id="draft"></textarea></main></div></div></body></html>', { headers: { 'content-type': 'text/html' } }));
  const remoteReady = nextPage(); const added = await shell.executeJavaScript('window.vxchat.command({ action: "add", service_id: "messenger" })');
  assert.equal(added.ok, true); const remote = await remoteReady;
  assert.equal(remote.getURL(), 'https://www.facebook.com/');
  assert.notEqual(await remote.executeJavaScript('getComputedStyle(document.querySelector("#global")).display'), 'none');
  const tabID = added.state.active_tab_id;
  const setupTooltip = await shell.executeJavaScript('document.getElementById("setup-btn").title');
  assert.ok(setupTooltip.includes('quản lý tài khoản') || setupTooltip.includes('account management'));
  phase = 'await_setup_ready';
  let confirmable = false;
  for (let n = 0; n < 30 && !confirmable; n++) { const current = await shell.executeJavaScript('window.vxchat.command({ action: "state" })'); confirmable = current.state.tabs.find(t => t.id === tabID)?.setup?.can_confirm; if (!confirmable) await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.equal(confirmable, true, 'Synthetic setup page must be confirmable');
  phase = 'confirm_setup';
  const confirmationLoaded = once(remote, 'did-finish-load');
  const confirmed = await shell.executeJavaScript(`window.vxchat.command({ action: "confirm_setup", tab_id: ${JSON.stringify(tabID)} })`); assert.equal(confirmed.ok, true, JSON.stringify(confirmed)); await confirmationLoaded;
  assert.equal(remote.getURL(), 'https://www.facebook.com/messages/t');
  // insertCSS resolves asynchronously after page commit; poll only the synthetic DOM.
  let hidden = false;
  for (let n = 0; n < 30 && !hidden; n++) { hidden = await remote.executeJavaScript('getComputedStyle(document.querySelector("#global")).display === "none"'); if (!hidden) await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.equal(hidden, true);
  phase = 'messenger_layout_geometry';
  let layout;
  for (let n = 0; n < 30; n++) {
    layout = await remote.executeJavaScript('({top:document.querySelector(".chat-frame").getBoundingClientRect().top,bottom:document.querySelector("#draft").getBoundingClientRect().bottom,viewport:innerHeight})');
    if (layout.top === 0) break; await new Promise(resolve => setTimeout(resolve,20));
  }
  assert.equal(layout.top,0); assert.ok(layout.bottom <= layout.viewport); assert.ok(layout.bottom >= layout.viewport - 10);
  phase = 'image_viewer';
  let imageMenu; const originalMenu = Menu.buildFromTemplate;
  Menu.buildFromTemplate = template => { imageMenu = template; return { popup() {} }; };
  remote.emit('context-menu', {}, { mediaType:'image',srcURL:'https://www.facebook.com/fixture_image.png?private=synthetic',linkURL:'https://example.test/different-link',hasImageContents:true,x:1,y:1 });
  Menu.buildFromTemplate = originalMenu;
  assert.ok(imageMenu.some(item => /liên kết|link/.test(item.label || '')));
  const viewerReady = nextPage(); imageMenu[0].click(); const imageContents = await viewerReady;
  const imageWindow = electron.BrowserWindow.fromWebContents(imageContents);
  assert.equal(imageContents.session,remote.session); assert.equal(imageWindow.getParentWindow(),null); assert.equal(imageWindow.isAlwaysOnTop(),false);
  assert.equal(imageContents.getLastWebPreferences().preload,undefined); assert.equal(imageContents.getLastWebPreferences().sandbox,true);
  assert.equal(imageContents.getLastWebPreferences().javascript,false);
  let decoded = false;
  for (let n = 0; n < 30 && !decoded; n++) { decoded = await imageContents.executeJavaScriptInIsolatedWorld(1025,[{code:'!!document.querySelector("img")?.naturalWidth && document.querySelector("img").style.maxWidth === "100vw"'}]); if (!decoded) await new Promise(resolve => setTimeout(resolve,20)); }
  assert.equal(decoded,true,'Image must really decode and render before viewer QA passes');
  const chatZoom = remote.getZoomFactor();
  imageContents.emit('before-input-event',{preventDefault(){}},{type:'keyDown',key:'+',meta:true});
  let imageWidth = 0;
  for (let n=0;n<30;n++) { imageWidth = await imageContents.executeJavaScriptInIsolatedWorld(1025,[{code:'document.querySelector("img").getBoundingClientRect().width'}]); if(imageWidth > 1) break; await new Promise(resolve=>setTimeout(resolve,20)); }
  assert.ok(imageWidth > 1);assert.equal(remote.getZoomFactor(),chatZoom,'Image zoom must not change same-origin chat zoom');
  assert.ok(!imageWindow.getTitle().includes('private'));
  sampleMemory('messenger_and_image_viewer');
  const imageDestroyed = once(imageContents,'destroyed'); imageContents.emit('before-input-event',{preventDefault(){}},{type:'keyDown',key:'Escape'}); await imageDestroyed;
  phase = 'owned_blob_viewer';
  const blobURL = await remote.executeJavaScript('URL.createObjectURL(new Blob([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="),c=>c.charCodeAt(0))],{type:"image/png"}))');
  Menu.buildFromTemplate = template => { imageMenu = template; return { popup() {} }; };
  remote.emit('context-menu',{}, {mediaType:'image',srcURL:blobURL,hasImageContents:true,x:1,y:1});Menu.buildFromTemplate = originalMenu;
  const blobReady = nextPage();imageMenu[0].click();const blobContents = await blobReady;
  for(let n=0;n<100;n++){if(blobContents.getURL().startsWith('data:image/') && !blobContents.isLoadingMainFrame())break;await new Promise(r=>setTimeout(r,20));}
  let blobDecoded = false;
  for(let n=0;n<30 && !blobDecoded;n++){blobDecoded = await blobContents.executeJavaScriptInIsolatedWorld(1025,[{code:'!!document.querySelector("img")?.naturalWidth'}]);if(!blobDecoded)await new Promise(r=>setTimeout(r,20));}
  assert.equal(blobDecoded,true);const blobDestroyed = once(blobContents,'destroyed');electron.BrowserWindow.fromWebContents(blobContents).close();await blobDestroyed;
  await remote.executeJavaScript(`URL.revokeObjectURL(${JSON.stringify(blobURL)})`);
  sampleMemory('after_image_viewer_closed');
  phase = 'call_window_ownership';
  const callReady = nextPage(); await remote.executeJavaScript('window.open("https://www.messenger.com/groupcall/fixture", "vxchat_call_fixture"); undefined'); const callContents = await callReady;
  const callWindow = electron.BrowserWindow.fromWebContents(callContents);
  assert.equal(callWindow.getParentWindow(),null); assert.equal(callWindow.isAlwaysOnTop(),false); assert.equal(callWindow.isModal(),false); callWindow.close();
  phase = 'browser_link';
  const opened = []; const originalOpen = electron.shell.openExternal; electron.shell.openExternal = async url => { opened.push(url); };
  try {
    phase = 'scope_spa';
    await remote.executeJavaScript('document.querySelector("#draft").value = "synthetic retained draft"; window.fixtureDocument = {}');
    // Wait for the isolated-world adapter, rather than assuming insertCSS also
    // proves the separate Navigation API installation completed.
    let guarded = false;
    for (let n = 0; n < 30 && !guarded; n++) { guarded = await remote.executeJavaScriptInIsolatedWorld(1023, [{ code: 'typeof globalThis.__vxchatNavigationScope === "function"' }]); if (!guarded) await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.equal(guarded, true);
    for (const method of ['pushState', 'replaceState']) {
      const count = opened.length;
      await remote.executeJavaScript(`try { history.${method}({}, '', '/notifications/${method}'); } catch (e) { if (e.name !== 'AbortError') throw e; }`);
      for (let n = 0; n < 30 && opened.length === count; n++) await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(opened.length, count + 1, method + ' must externalize once');
      assert.equal(remote.getURL(), 'https://www.facebook.com/messages/t');
      assert.deepEqual(await remote.executeJavaScript('({ draft:document.querySelector("#draft").value, sameDocument:!!window.fixtureDocument })'), { draft: 'synthetic retained draft', sameDocument: true });
    }
    opened.length = 0;
    phase = 'scope_document';
    await remote.executeJavaScript('location.href = "https://example.test/article"');
    for (let n = 0; n < 30 && !opened.length; n++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(opened, ['https://example.test/article']); assert.equal(remote.getURL(), 'https://www.facebook.com/messages/t');
  } finally { electron.shell.openExternal = originalOpen; }
  phase = 'reset_setup';
  const resetLoaded = once(remote, 'did-finish-load'); await shell.executeJavaScript(`window.vxchat.command({ action: "setup_reset", tab_id: ${JSON.stringify(tabID)} })`); await resetLoaded;
  assert.equal(remote.getURL(), 'https://www.facebook.com/'); assert.notEqual(await remote.executeJavaScript('getComputedStyle(document.querySelector("#global")).display'), 'none');
  await shell.executeJavaScript(`window.vxchat.command({ action: "close", tab_id: ${JSON.stringify(tabID)} })`);
  partition.protocol.unhandle('https');
  phase = 'teardown';
  const shellDestroyed = once(shell, 'destroyed');
  for (const window of BaseWindow.getAllWindows()) window.destroy();
  await shellDestroyed;
  assert.equal(shell.isDestroyed(), true);
  console.log(JSON.stringify({ result: 'PASS', local_shell_ipc: true, titlebar_dom_geometry: geometry, min_width_geometry: compactGeometry, settings_native_close: true, messenger_setup_gate: true, messenger_synthetic_layout:layout, messenger_push_replace_state_preserves_document_and_draft:true, image_viewer_session_and_cleanup:true, call_window_native_parentless:true, external_browser_dispatch_stubbed: true, malicious_payload_rejected: true, backlog_disabled: true, valid_empty_state: true, shell_disposed: true, provider_pages_opened: 0, real_profiles_used: false, memory_samples:memorySamples }));
}).catch(error => { failed = true; console.error(JSON.stringify({failed_phase:phase})); console.error(error.stack); }).finally(() => {
  clearTimeout(timeout);
  for (const window of BaseWindow.getAllWindows()) window.destroy();
  app.exit(failed ? 1 : 0);
});
