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
app.setPath('downloads',temporary);
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
  const captureLauncher=async name=>{
    if (!process.env.VXCHAT_QA_OUTPUT) return;
    const host=BaseWindow.getAllWindows().find(w=>w.getTitle()==='VXChat');host.showInactive();
    try {await new Promise(resolve=>setTimeout(resolve,150));fs.writeFileSync(path.join(process.env.VXCHAT_QA_OUTPUT,name),(await shell.capturePage()).toPNG());}
    finally {host.hide();}
  };
  sampleMemory('empty_shell');
  assert.ok(shell);
  // app.ready resolves after loadFile; did-finish-load has already fired.
  // isLoading may remain true briefly for subresources and cannot gate this event again.
  phase = 'state_ipc';
  const result = await shell.executeJavaScript('window.vxchat.command({ action: "state" })');
  assert.equal(result.ok, true); assert.deepEqual(result.state.tabs, []);
  assert.equal(await shell.executeJavaScript('document.querySelectorAll("#theme-btn,#lang-btn").length'),0,'Theme and language belong in Settings only');
  phase='persistent_service_launcher';
  assert.deepEqual(await shell.executeJavaScript('[...document.querySelectorAll(".service-group")].map(e=>e.dataset.serviceId)'),['messenger','zalo','slack','chatgpt']);
  assert.equal(await shell.executeJavaScript('document.querySelector("[data-add-service=messenger]").getAttribute("aria-disabled")'),'true');
  const launcherTest=await shell.executeJavaScript(`(() => {
    const state=current;render({...state,tabs:[{id:'synthetic',service_id:'chatgpt',label:'ChatGPT',status:'ready'}],active_tab_id:'synthetic'});
    const services=[...document.querySelectorAll('.service-group')].map(e=>e.dataset.serviceId);
    document.querySelector('[data-add-service=messenger]').click();
    render(state);return {services,plusLabel:document.querySelector('[data-add-service=chatgpt]').getAttribute('aria-label')};
  })()`);
  assert.equal(launcherTest.services.length,4);assert.ok(/ChatGPT/.test(launcherTest.plusLabel));
  assert.equal((await shell.executeJavaScript('window.vxchat.command({action:"state"})')).state.tabs.length,0);
  await shell.executeJavaScript('document.getElementById("manage-services").click();document.querySelector("[data-visibility-id=slack]").click()');
  for(let n=0;n<30;n++){if(await shell.executeJavaScript('!document.querySelector(".service-group[data-service-id=slack]")'))break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(await shell.executeJavaScript('!!document.querySelector(".service-group[data-service-id=slack]")'),false);
  assert.deepEqual((await shell.executeJavaScript('window.vxchat.command({action:"preferences_get"})')).preferences.hidden_services,['slack']);
  await shell.executeJavaScript(`(() => {
    const source=document.querySelector('[data-service-id=chatgpt]'),target=document.querySelector('[data-service-id=messenger]'),transfer=new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
    target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:target.getBoundingClientRect().left}));
  })()`);
  for(let n=0;n<30;n++){if(await shell.executeJavaScript('document.querySelector(".service-group").dataset.serviceId === "chatgpt"'))break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(await shell.executeJavaScript('document.querySelector(".service-group").dataset.serviceId'),'chatgpt');
  assert.equal(webContents.getAllWebContents().length,1,'Hiding and reordering shortcuts must not allocate service views');
  await shell.executeJavaScript('window.vxchat.command({action:"preferences_update",patch:{service_order:["messenger","zalo","slack","chatgpt"],hidden_services:[]}})');
  await shell.executeJavaScript('document.getElementById("manage-services").click()');
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
  await captureLauncher('launcher_empty_vi.png');
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
  phase='chatgpt_scoped_plus';
  const aiSession=session.fromPartition('persist:service-chatgpt');
  await aiSession.protocol.handle('https',()=>new Response('<!doctype html><title>Synthetic AI</title><textarea></textarea>',{headers:{'content-type':'text/html'}}));
  const firstAIReady=nextPage();await shell.executeJavaScript('document.querySelector("[data-launch-service=chatgpt]").click()');const firstAI=await firstAIReady;
  const secondAIReady=nextPage();await shell.executeJavaScript('document.querySelector("[data-add-service=chatgpt]").click()');const secondAI=await secondAIReady;
  const aiState=(await shell.executeJavaScript('window.vxchat.command({action:"state"})')).state;
  assert.deepEqual(aiState.tabs.map(tab=>tab.label),['ChatGPT','ChatGPT 2']);assert.equal(firstAI.session,secondAI.session);
  assert.equal(await shell.executeJavaScript('document.querySelector("[data-service-id=chatgpt]").lastElementChild.dataset.addService'),'chatgpt');
  assert.equal(await shell.executeJavaScript('document.querySelector("[data-launch-service=slack]").classList.contains("is-unopened")'),true);
  assert.equal(await shell.executeJavaScript('document.querySelector("[data-launch-service=chatgpt]").classList.contains("is-unopened")'),false);
  assert.equal(await shell.executeJavaScript('document.getElementById("page-location").nextElementSibling.id'),'manage-services');
  await captureLauncher('launcher_two_chatgpt_vi.png');
  assert.equal(await shell.executeJavaScript('document.querySelectorAll(".service-group").length'),4);
  for(const tab of aiState.tabs)await shell.executeJavaScript(`window.vxchat.command({action:'close',tab_id:${JSON.stringify(tab.id)}})`);
  assert.equal(await shell.executeJavaScript('document.querySelectorAll(".service-group").length'),4,'Closing the last tab retains all service shortcuts');
  aiSession.protocol.unhandle('https');
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
  phase='download_panel_manual';
  let panel;
  for(let n=0;n<60;n++){panel=webContents.getAllWebContents().find(w=>w.getURL().endsWith('/downloads_panel.html'));if(panel&&!panel.isLoadingMainFrame())break;await new Promise(r=>setTimeout(r,20));}
  assert.ok(panel);assert.equal((await panel.executeJavaScript('window.vxchat.command({action:"download_list"})')).downloads.length,0);
  assert.equal((await panel.executeJavaScript('window.vxchat.command({action:"add",service_id:"chatgpt"})')).ok,false);
  await panel.executeJavaScript('window.vxchat.command({action:"window_close"})');
  phase = 'messenger_setup';
  const partition = session.fromPartition('persist:service-messenger');
  await partition.protocol.handle('https', request => new URL(request.url).pathname === '/fixture_download.txt' ? new Response('synthetic download', {headers:{'content-type':'text/plain','content-disposition':'attachment; filename=fixture_download.txt'}}) : new URL(request.url).pathname === '/fixture_image.png' ? new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'), { headers:{'content-type':'image/png'} }) : new Response('<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;min-height:calc(100vh + 8px);--header-height:56px}header{position:fixed;top:0;height:var(--header-height)}.chat-frame{--header-height:56px;position:absolute;top:var(--header-height);height:calc(100vh - var(--header-height));width:100%}.chat-shell{display:flex;height:100%}nav{width:200px;overflow-y:auto}nav .thread-list{height:1600px}main{display:flex;flex-direction:column;flex:1;min-height:0}textarea{margin-top:auto;height:40px}</style></head><body><header role="banner" id="global">Facebook navigation</header><div class="chat-frame"><div class="chat-shell"><nav role="navigation"><div class="thread-list"><a href="/messages/t/123">Synthetic thread</a></div></nav><main role="main">Synthetic Messenger fixture<textarea id="draft"></textarea></main></div></div></body></html>', { headers: { 'content-type': 'text/html' } }));
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
  phase='download_completion_panel';
  const originalOpenPath=electron.shell.openPath,originalReveal=electron.shell.showItemInFolder,openedFiles=[],revealedFiles=[];
  electron.shell.openPath=async file=>{openedFiles.push(file);return '';};electron.shell.showItemInFolder=file=>revealedFiles.push(file);
  try{
    const focusedBefore=webContents.getFocusedWebContents();
    remote.downloadURL('https://www.facebook.com/fixture_download.txt');
    let completed;
    for(let n=0;n<100;n++){
      const data=await panel.executeJavaScript('window.vxchat.command({action:"download_list"})');completed=data.downloads.find(item=>item.status==='completed');
      if(completed)break;await new Promise(r=>setTimeout(r,20));
    }
    assert.ok(completed,'A real synthetic download must complete');assert.equal(webContents.getFocusedWebContents(),focusedBefore);
    assert.ok(primaryWindow.contentView.children.some(v=>v.webContents===panel),'Completion must attach the dropdown above content');
    for(let n=0;n<30;n++){if(await panel.executeJavaScript('!!document.querySelector("[data-action=open]")'))break;await new Promise(r=>setTimeout(r,20));}
    assert.equal(await panel.executeJavaScript('!!document.querySelector("[data-action=reveal]")'),true);
    if(process.env.VXCHAT_QA_OUTPUT){
      primaryWindow.showInactive();
      try{await new Promise(r=>setTimeout(r,150));fs.writeFileSync(path.join(process.env.VXCHAT_QA_OUTPUT,'download_panel.png'),(await panel.capturePage()).toPNG());}
      finally{primaryWindow.hide();}
    }
    await panel.executeJavaScript(`window.vxchat.command({action:'download_open',id:${JSON.stringify(completed.id)}})`);
    await panel.executeJavaScript(`window.vxchat.command({action:'download_reveal',id:${JSON.stringify(completed.id)}})`);
    assert.equal(openedFiles.length,1);assert.deepEqual(openedFiles,revealedFiles);assert.equal(path.dirname(openedFiles[0]),temporary);
    assert.equal((await panel.executeJavaScript('window.vxchat.command({action:"download_open",id:"/tmp/arbitrary"})')).ok,false);
    await panel.executeJavaScript('window.vxchat.command({action:"window_close"})');
    assert.equal(primaryWindow.contentView.children.some(v=>v.webContents===panel),false);
    await shell.executeJavaScript('window.vxchat.command({action:"download_panel"})');
    let escapePrevented=false;remote.emit('before-input-event',{preventDefault(){escapePrevented=true;}},{type:'keyDown',key:'Escape'});
    assert.equal(escapePrevented,true);assert.equal(primaryWindow.contentView.children.some(v=>v.webContents===panel),false);
    const fullDownloadsReady=nextPage();await panel.executeJavaScript('window.vxchat.command({action:"downloads"})');const fullDownloads=await fullDownloadsReady;
    for(let n=0;n<30;n++){if(await fullDownloads.executeJavaScript('!!document.querySelector("[data-action=open]")'))break;await new Promise(r=>setTimeout(r,20));}
    assert.equal(await fullDownloads.executeJavaScript('!!document.querySelector("[data-action=reveal]")'),true);
    const fullClosed=once(fullDownloads,'destroyed');await fullDownloads.executeJavaScript('window.vxchat.command({action:"window_close"})').catch(()=>{});await fullClosed;
  }finally{electron.shell.openPath=originalOpenPath;electron.shell.showItemInFolder=originalReveal;}
  // Exercise React-like subtree replacement, nested header variables, the
  // thread rail and viewport changes rather than one static common frame.
  const readGeometry = async () => remote.executeJavaScript(`(() => {
    const nav = document.querySelector('nav'), main = document.querySelector('main');
    const frame = document.querySelector('.chat-frame').getBoundingClientRect();
    nav.scrollTop = 240;
    return {top:frame.top,bottom:frame.bottom,viewport:innerHeight,navBottom:nav.getBoundingClientRect().bottom,
      composerBottom:document.querySelector('#draft').getBoundingClientRect().bottom,scroll:nav.scrollTop,
      outerOverflow:getComputedStyle(document.documentElement).overflowY,
      hit:main.contains(document.elementFromPoint(innerWidth-80,innerHeight-30)),
      fixedMarkers:document.querySelectorAll('[data-vx-messenger-frame],[data-vx-messenger-shell]').length};
  })()`);
  for (const [width,height] of [[800,600],[1200,820]]) {
    primaryWindow.setSize(width,height);
    await remote.executeJavaScript(`document.querySelector('main').innerHTML = '<section style="--header-height:56px;display:flex;flex-direction:column;flex:1;min-height:0"><div>New conversation</div><textarea id="draft"></textarea></section>'`);
    await new Promise(resolve => setTimeout(resolve,100));
    const actual = await readGeometry();
    assert.equal(actual.top,0); assert.equal(actual.bottom,actual.viewport);
    assert.equal(actual.navBottom,actual.viewport); assert.ok(actual.composerBottom >= actual.viewport-10);
    assert.equal(actual.scroll,240); assert.equal(actual.outerOverflow,'hidden');
    assert.equal(actual.hit,true); assert.equal(actual.fixedMarkers,0);
  }
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
