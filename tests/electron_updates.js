'use strict';
// Native UI/controller fixture with a synthetic feed. Not a signed update E2E.
const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const {pathToFileURL} = require('node:url');
const {app,BaseWindow,WebContentsView,ipcMain} = require('electron');
const {installIPC} = require('../src/main/ipc'); const {UpdateNotice} = require('../src/main/update_notice'); const {UpdateController} = require('../src/core/update_controller'); const {PreferencesStore} = require('../src/core/preferences_store');
if (!process.env.VXCHAT_FIXTURE_DIR) throw new Error('Use fixture runner');
app.setPath('userData',process.env.VXCHAT_FIXTURE_DIR);
let main,settings,notice,ipc,mainView,settingsView,controller; let failed = false;
const timeout = setTimeout(() => {console.error('update_fixture_timeout');app.exit(1);},20000);
const poll = async predicate => { for (let n = 0; n < 60; n++) {if (await predicate()) return; await new Promise(r => setTimeout(r,20));} throw new Error('UI state did not settle'); };
const file = name => path.join(__dirname,`../src/shell/${name}.html`);
const view = () => { const v = new WebContentsView({webPreferences:{preload:path.join(__dirname,'../src/preload/shell.js'),sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true,partition:'persist:vxchat_update_fixture_ui'}}); v.webContents.setWindowOpenHandler(() => ({action:'deny'}));v.webContents.on('will-navigate',e => e.preventDefault());return v; };
app.whenReady().then(async () => {
  const prefs = new PreferencesStore(path.join(process.env.VXCHAT_FIXTURE_DIR,'prefs.json'));
  let release = '1.0.1'; let checks = 0; let downloads = 0; let install = 0; let finish;
  const adapter = {check:async () => {checks++; return {version:release};},download:() => {downloads++; return new Promise(r => {finish = r;});},prepare:async () => {},install:() => {install++;},cancel(){},dispose(){}};
  main = new BaseWindow({width:800,height:600,show:false}); mainView = view(); main.contentView.addChildView(mainView); mainView.setBounds({x:0,y:0,width:800,height:68});
  ipc = installIPC({ipcMain,shellContents:mainView.webContents,shellURL:pathToFileURL(file('index')).href,engine:{snapshot:() => ({tabs:[],active_tab_id:null})},dispatch:async command => {
    switch (command.action) {
      case 'preferences_get':return {preferences:prefs.snapshot()};
      case 'preferences_update': {const value = prefs.update(command.patch); ipc.broadcast('preferences',value); return {preferences:value};}
      case 'metadata':return {metadata:{version:'1.0.0',platform:process.platform,updater:true,electron:process.versions.electron,chromium:process.versions.chrome,node:process.versions.node}};
      case 'permission_list':return {permissions:[]};
      case 'update_state':return {update:controller.snapshot()};
      case 'update_check':return {update:await controller.check()};
      case 'update_install':void controller.install();return {update:controller.snapshot()};
      case 'update_dismiss':return {update:controller.dismiss()};
      case 'update_layout':notice.resize(command.height);return {};
      default:return {};
    }
  }});
  controller = new UpdateController({adapter,version:'1.0.0',changed:state => {ipc.broadcast('updates',state);notice?.sync(state);}});
  notice = new UpdateNotice({window:main,view:view(),file:file('update_notice'),ipc});
  settings = new BaseWindow({width:672,height:560,show:false});settingsView = view();settings.contentView.addChildView(settingsView);settingsView.setBounds({x:0,y:0,width:672,height:560});
  ipc.register(settingsView.webContents,'settings',pathToFileURL(file('settings')).href,() => settings.close());
  await Promise.all([mainView.webContents.loadFile(file('index')),settingsView.webContents.loadFile(file('settings'))]);
  await poll(() => !notice.view.webContents.isLoading());
  await controller.check(); await poll(() => notice.view.webContents.executeJavaScript('document.body.textContent.includes("1.0.1")'));
  assert.equal(notice.attached,true);assert.equal(checks,1);assert.equal(downloads,0);
  const geometry = await notice.view.webContents.executeJavaScript('(()=>{const r=document.querySelector(".vx-updates").getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,top:r.top,viewport:innerWidth}})()');
  assert.ok(geometry.width <= 384);assert.ok(geometry.height < 220);assert.equal(geometry.left,8);
  await settingsView.webContents.executeJavaScript('document.querySelector("[data-tab=updates]").click()');
  if (process.env.VXCHAT_QA_OUTPUT) {main.showInactive(); await new Promise(r => setTimeout(r,150)); fs.writeFileSync(path.join(process.env.VXCHAT_QA_OUTPUT,'updates_vi.png'),(await notice.view.webContents.capturePage()).toPNG()); main.hide();}
  await settingsView.webContents.executeJavaScript('window.vxchat.command({action:"preferences_update",patch:{language:"en",theme:"light"}})');
  await poll(() => notice.view.webContents.executeJavaScript('document.body.textContent.includes("Update & restart")'));
  if (process.env.VXCHAT_QA_OUTPUT) {main.showInactive(); await new Promise(r => setTimeout(r,150)); fs.writeFileSync(path.join(process.env.VXCHAT_QA_OUTPUT,'updates_en.png'),(await notice.view.webContents.capturePage()).toPNG()); main.hide();}
  await settingsView.webContents.executeJavaScript('window.vxchat.command({action:"update_dismiss"})');assert.equal(notice.attached,false);
  assert.equal(controller.snapshot().state,'available');
  release = '1.0.2'; await controller.check(); assert.equal(notice.attached,true);
  await Promise.all([notice.view.webContents.executeJavaScript('document.querySelector("button.primary").click()'),settingsView.webContents.executeJavaScript('document.querySelector("#updates-controller button.primary").click()')]);
  await poll(() => downloads === 1);adapter.progress(42);
  await poll(() => settingsView.webContents.executeJavaScript('document.querySelector("#updates-controller").textContent.includes("42%")'));
  assert.equal(downloads,1); finish();await poll(() => install === 1);
  console.log(JSON.stringify({result:'PASS',synthetic_feed:true,signed_update_e2e:false,one_shared_job:true,dismiss_preserves_settings_state:true,notice_geometry:geometry,bilingual_ui:true,download_count:downloads,native_view_cleanup:true}));
}).catch(error => {failed = true;console.error(error.stack);}).finally(() => {
  clearTimeout(timeout);controller?.dispose();notice?.dispose();ipc?.();
  for (const v of [mainView,settingsView]) if (v && !v.webContents.isDestroyed()) v.webContents.close({waitForBeforeUnload:false});
  for (const w of BaseWindow.getAllWindows()) w.destroy();app.exit(failed ? 1 : 0);
});
