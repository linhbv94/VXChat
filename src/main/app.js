'use strict';
const electron = require('electron');
const { app, BaseWindow, WebContentsView, session, dialog, Menu, ipcMain } = electron;
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { ServiceState, initialServiceState } = require('../core/service_state');
const { WindowStateStore } = require('../core/window_state');
const { primaryWindowOptions } = require('./window_chrome');
const { StateStore, initialState } = require('../core/state_store');
const { PreferencesStore, DEFAULTS } = require('../core/preferences_store');
const { PermissionStore } = require('../core/permission_store');
const { fingerprint, backupAndReset } = require('../core/atomic_json');
const { SERVICES } = require('../core/services');
const { TabEngine } = require('../core/tab_engine');
const { ProfileStore, defaultProfiles } = require('../core/profile_store');
const { SessionPolicy } = require('./session_policy');
const { ContentOwner } = require('./content_owner');
const { DownloadRegistry } = require('./download_registry');
const { installIPC } = require('./ipc');
const { createDisplayPicker } = require('./display_picker');
const { text } = require('./messages');
const product = require('../core/product_metadata');
const { createUpdates } = require('./update_adapter');
const { UpdateNotice } = require('./update_notice');
const { DownloadPanel } = require('./download_panel');
const { createDownloadFeedbackTracker } = require('../shell/download_feedback');
const { resolveReleaseQA,recordReleaseQA } = require('./release_qa');
app.setName('VXChat');
if (app.isPackaged && process.platform === 'win32') app.setAppUserModelId('com.vxutilities.vxmesschat');
// Separate profile; never copy Swift, browser or spike cookies.
const releaseQA = resolveReleaseQA(app);
const qaProfile = releaseQA?.profile || process.env.VXCHAT_QA_PROFILE;
if (qaProfile) {
  if (!releaseQA && (app.isPackaged || !path.basename(qaProfile).startsWith('vxchat_shell_fixture_') || fs.realpathSync(path.dirname(qaProfile)) !== fs.realpathSync(os.tmpdir()))) throw new Error('invalid_qa_profile');
  app.setPath('userData', qaProfile);
} else app.setPath('userData', path.join(app.getPath('appData'), 'VXChat', 'chromium_v2'));
let window = null; let engine = null; let preferences; let downloads; let ipc; let windowState = null;
let quitting = false; let quitPending = false; let chromeHeight = 68; let contentTop = 68;
let updates = null; let updateNotice = null;
let downloadPanel = null;
const secondary = new Map();
const getLanguage = () => preferences?.snapshot().language || 'vi';
const t = key => text(getLanguage(), key);
const uiFile = name => path.join(__dirname, `../shell/${name}.html`);
const webPreferences = () => ({ preload: path.join(__dirname, '../preload/shell.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false, partition: 'persist:vxchat_shell' });
function localView(file) {
  const view = new WebContentsView({ webPreferences: webPreferences() });
  view.webContents.on('before-input-event',dismissDownloadPanel);
  view.webContents.on('will-navigate', event => event.preventDefault());
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('will-attach-webview', event => event.preventDefault());
  return view;
}
function dismissDownloadPanel(event,input){
  if(input.type==='keyDown'&&input.key==='Escape'){
    if(downloadPanel?.attached){downloadPanel.hide();event.preventDefault();}
    ipc?.broadcast('dismiss',{});
  }
}
function hideDownloadPanel(){downloadPanel?.hide();ipc?.broadcast('dismiss',{});}
function dismissOnContentInput(_event,input){
  if(['mouseDown','gestureTapDown','mouseWheel'].includes(input?.type)){
    if(downloadPanel?.attached)downloadPanel.hide();
    ipc?.broadcast('dismiss',{});
  }
}
function openUtility(role) {
  const existing = secondary.get(role);
  if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return; }
  const utility = new BaseWindow({ width: 672, height: 560, minWidth: 600, minHeight: 500, title: `VXChat — ${t(role)}`, show: !qaProfile, backgroundColor: '#141821' });
  secondary.set(role, utility);
  const file = uiFile(role); const view = localView(file); utility.contentView.addChildView(view);
  const unregister = ipc.register(view.webContents, role, pathToFileURL(file).href, () => utility.close());
  const resize = () => { if (!utility.isDestroyed()) { const { width, height } = utility.getContentBounds(); view.setBounds({ x: 0, y: 0, width, height }); } };
  utility.on('resize', resize); resize();
  utility.once('closed', () => { unregister(); if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false }); if (secondary.get(role) === utility) secondary.delete(role); });
  void view.webContents.loadFile(file).catch(() => utility.destroy());
}
async function recoverable(file, construct, defaults) {
  try { return construct(); }
  catch (error) {
    if (qaProfile || !error.message.endsWith('_recovery_required')) throw error;
    // Never reset automatically, nor replace a symlink/non-regular file.
    const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink()) throw error;
    const expected = fingerprint(file);
    const { response } = await dialog.showMessageBox({ type: 'warning', title: 'VXChat', message: t('recovery'), detail: `${path.basename(file)}\n${t('recoveryDetail')}`, buttons: [t('keepAndQuit'), t('backupAndReset')], defaultId: 0, cancelId: 0 });
    if (response !== 1) { quitting = true; app.quit(); return null; }
    backupAndReset(file, expected, defaults()); return construct();
  }
}
function buildMenu() {
  const run = work => void work().catch(() => dialog.showErrorBox('VXChat', t('operationFailed')));
  const active = method => { if (engine.state.active_tab_id) run(() => engine[method](engine.state.active_tab_id)); };
  const settings = { label: t('settings'), accelerator: 'CmdOrCtrl+,', click: () => openUtility('settings') };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'VXChat', submenu: [
      { label: t('about'), role: 'about' }, { type: 'separator' }, settings, { type: 'separator' },
      { label: t('services'), role: 'services' }, { type: 'separator' },
      { label: t('hide'), role: 'hide' }, { label: t('hideOthers'), role: 'hideOthers' }, { label: t('showAll'), role: 'unhide' }, { type: 'separator' }, { label: t('quit'), role: 'quit' }
    ] }] : [{ label: t('file'), submenu: [settings, { label: t('quit'), role: 'quit' }] }]),
    { label: 'Tab', submenu: [
      { label: t('newTab'), accelerator: 'CmdOrCtrl+T', click: () => Menu.buildFromTemplate(Object.entries(SERVICES).map(([id, s]) => ({ label: s.label, click: () => run(() => engine.add(id)) }))).popup({ window }) },
      { label: t('closeTab'), accelerator: 'CmdOrCtrl+W', click: () => { const focused = BaseWindow.getFocusedWindow(); if (focused && focused !== window) focused.close(); else active('close'); } },
      { label: t('nextTab'), accelerator: 'Ctrl+Tab', click: () => run(() => engine.cycle(1)) },
      { label: t('previousTab'), accelerator: 'Ctrl+Shift+Tab', click: () => run(() => engine.cycle(-1)) },
      { label: t('reload'), accelerator: 'CmdOrCtrl+R', click: () => { const focused = BaseWindow.getFocusedWindow(); if (!focused || focused === window) active('reload'); else if (![...secondary.values()].includes(focused)) electron.webContents.getFocusedWebContents()?.reload(); } },
      { label: t('home'), click: () => active('home') }, { label: t('downloads'), click: () => openUtility('downloads') }
    ] },
    { label: t('edit'), submenu: ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'].map(role => ({ label: t(role), role })) }, { role: 'windowMenu' }
  ]));
}
async function createWindow() {
  const root = app.getPath('userData'); fs.mkdirSync(root, { recursive: true });
  const prefFile = path.join(root, 'preferences_v1.json');
  preferences = await recoverable(prefFile, () => new PreferencesStore(prefFile), () => ({ ...DEFAULTS })); if (!preferences) return;
  const permissionFile = path.join(root, 'permissions_v1.json');
  const permissionStore = await recoverable(permissionFile, () => new PermissionStore(permissionFile), () => ({ schema_version: 1, entries: [] })); if (!permissionStore) return;
  const serviceFile = path.join(root, 'service_state_v1.json');
  const serviceState = await recoverable(serviceFile, () => new ServiceState(serviceFile), initialServiceState); if (!serviceState) return;
  const stateFile = path.join(root, 'tabs_state_v2.json');
  const store = await recoverable(stateFile, () => { const value = new StateStore(stateFile); value.load(); return value; }, initialState); if (!store) return;
  const profileFile = path.join(root, 'profiles_v1.json');
  const profileStore = await recoverable(profileFile, () => new ProfileStore(profileFile), () => ({ schema_version: 1, profiles: defaultProfiles() })); if (!profileStore) return;
  windowState = new WindowStateStore(path.join(root, 'window_state_v1.json'));
  const initialWindow = windowState.restore(electron.screen);
  window = new BaseWindow({ ...(initialWindow.x !== undefined ? { x: initialWindow.x, y: initialWindow.y } : {}), width: initialWindow.width, height: initialWindow.height, minWidth: 800, minHeight: 600, title: 'VXChat', backgroundColor: '#141821', ...primaryWindowOptions(process.platform), show: !qaProfile });
  if (!qaProfile) {
    if (initialWindow.full_screen) window.setFullScreen?.(true);
    else if (initialWindow.maximized) window.maximize?.();
  }
  const shellFile = uiFile('index'); const shellView = localView(shellFile); shellView.setBackgroundColor?.('#00000000'); window.contentView.addChildView(shellView);
  const owners = new Map(); const changed = () => { if (engine) ipc?.broadcast('state', engine.snapshot()); updateNotice?.resize(); downloadPanel?.resize(); };
  const completionTracker=createDownloadFeedbackTracker({onCue:()=>{ if (contentTop === 68) downloadPanel?.show(); }});completionTracker.update([]);
  downloads = new DownloadRegistry({ shell: electron.shell, directory: app.getPath('downloads'), getPreferences: () => preferences.snapshot(), changed: () => {const records=downloads.snapshot();ipc?.broadcast('downloads',records);completionTracker.update(records);} });
  const policy = new SessionPolicy({ session, dialog, window, resolveOwner: wc => owners.get(wc), permissionStore, downloads, systemPreferences: electron.systemPreferences, getLanguage, contentsFromFrame: frame => electron.webContents.fromFrame(frame), selectDisplaySource: createDisplayPicker({ desktopCapturer: electron.desktopCapturer, Menu, window, getLanguage }) });
  engine = new TabEngine({ store, profileStore, permissionStore, onChange: changed, createOwner: args => new ContentOwner({ ...args, electron, window, sessionPolicy: policy, register: (wc, owner) => {owners.set(wc, owner);wc.on('before-input-event',dismissDownloadPanel);wc.on('input-event',dismissOnContentInput);wc.on('context-menu',hideDownloadPanel);wc.on('focus',hideDownloadPanel);}, unregister: wc => {owners.delete(wc);wc.removeListener('before-input-event',dismissDownloadPanel);wc.removeListener('input-event',dismissOnContentInput);wc.removeListener('context-menu',hideDownloadPanel);wc.removeListener('focus',hideDownloadPanel);}, changed, getLanguage, serviceState, getZoom: id => { const z = preferences.snapshot().zoom_levels; const inst = engine?.state?.instances?.find(i => i.id === id); return z[id] || (inst && z[`default_${inst.service_id}`]) || 1; }, getChromeHeight: () => contentTop, getStartURL: id => id === 'slack' ? preferences.snapshot().slack_workspace_url : null }) });
  let boundsTimer = null;
  const scheduleBoundsSave = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => { boundsTimer = null; windowState?.recordWindow(window); }, 150);
    boundsTimer.unref?.();
  };
  const resize = () => {
    if (window.isDestroyed()) return;
    const { width } = window.getContentBounds(); shellView.setBounds({ x: 0, y: 0, width, height: chromeHeight });
    engine.owners.get(engine.state.active_tab_id)?.resize();
    updateNotice?.resize();
    downloadPanel?.resize();
    scheduleBoundsSave();
  };
  const savePreferences = work => {
    let value; try { value = work(); } catch (error) { if (['invalid_preferences', 'invalid_workspace_url'].includes(error.message)) throw error; throw new Error('config_write_failed'); }
    for (const owner of engine.owners.values()) owner.applyZoom();
    ipc.broadcast('preferences', value); buildMenu(); return { preferences: value };
  };
  let customServiceOpQueue = Promise.resolve();
  const withCustomServiceLock = fn => {
    const next = customServiceOpQueue.then(fn, fn);
    customServiceOpQueue = next.catch(() => {});
    return next;
  };
  ipc = installIPC({ ipcMain, shellContents: shellView.webContents, shellURL: pathToFileURL(shellFile).href, engine, onSettings: () => { downloadPanel?.hide(); openUtility('settings'); }, dispatch: async (command, client) => {
    switch (command.action) {
      case 'preferences_get': return { preferences: preferences.snapshot() };
      case 'preferences_update': return savePreferences(() => preferences.update(command.patch));
      case 'preferences_migrate': return savePreferences(() => preferences.migrate(command.patch));
      case 'preferences_reset': return savePreferences(() => preferences.reset());
      case 'zoom_update': {
        if (!engine.state.instances.some(i => i.id === command.instance_id)) throw new Error('invalid_preferences');
        return savePreferences(() => preferences.update({ zoom_levels: { ...preferences.snapshot().zoom_levels, [command.instance_id]:command.factor } }));
      }
      case 'download_directory_choose': {
        const result = await dialog.showOpenDialog(secondary.get('settings') || window, { properties:['openDirectory','createDirectory'] });
        if (result.canceled || result.filePaths.length !== 1) return { preferences:preferences.snapshot() };
        const folder = fs.realpathSync(result.filePaths[0]); if (!fs.statSync(folder).isDirectory()) throw new Error('invalid_preferences');
        return savePreferences(() => preferences.update({ download_directory:folder }));
      }
      case 'metadata': return { metadata: { ...product, platform: process.platform, version: app.getVersion(), electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node, packaged: app.isPackaged, updater:!!app.isPackaged && ['darwin','win32'].includes(process.platform) } };
      case 'update_state': return {update:updates?.snapshot()};
      case 'update_check': return {update:await updates.check()};
      case 'update_install': void updates.install(); return {update:updates.snapshot()};
      case 'update_dismiss': return {update:updates.dismiss()};
      case 'update_layout': updateNotice?.resize(command.height); return {};
      case 'repository_open': await electron.shell.openExternal(product.repository); return {};
      case 'window_close': client.close?.(); return {};
      case 'downloads': downloadPanel?.hide();openUtility('downloads'); return {};
      case 'download_panel': downloadPanel?.toggle();return {};
      case 'download_panel_hide': downloadPanel?.hide();return {};
      case 'download_list': return { downloads: downloads.snapshot() };
      case 'download_cancel': downloads.cancel(command.id); return {};
      case 'download_open': await downloads.open(command.id); return {};
      case 'download_reveal': downloads.reveal(command.id); return {};
      case 'download_clear': downloads.clearCompleted(); return {};
      case 'permission_list': return { permissions: permissionStore.snapshot() };
      case 'permission_revoke': permissionStore.revoke(command.id); return { permissions: permissionStore.snapshot() };
      case 'slack_open': { const id = await engine.add('slack'); await engine.home(id); window.show(); window.focus(); return {}; }
      case 'app_menu': downloadPanel?.hide(); Menu.getApplicationMenu()?.popup({ window }); return {};
      case 'layout': {
        chromeHeight = command.height;
        contentTop = command.content_top || (command.height <= 110 ? command.height : 68);
        resize();
        return {};
      }
      case 'custom_service_create': {
        return withCustomServiceLock(async () => {
          const id = `custom_${randomUUID().replace(/-/g, '')}`;
          const record = {
            id,
            label: command.label.trim(),
            service_url: command.service_url.trim(),
            login_url: (command.login_url && command.login_url.trim()) ? command.login_url.trim() : command.service_url.trim(),
            icon_key: command.icon_key,
            created_at: Date.now()
          };
          const created = await engine.createCustomService(record);
          try {
            const cur = preferences.snapshot();
            const nextCustom = [...(cur.custom_services || []), record];
            const nextOrder = [...cur.service_order, id];
            savePreferences(() => preferences.update({
              custom_services: nextCustom,
              service_order: nextOrder
            }));
          } catch (prefErr) {
            try { await engine.deleteCustomService(id); } catch {}
            throw prefErr;
          }
          return { service: record, tab_id: created.tab_id };
        });
      }
      case 'custom_service_delete': {
        return withCustomServiceLock(async () => {
          const cur = preferences.snapshot();
          if (!(cur.custom_services || []).some(c => c.id === command.service_id)) {
            throw new Error('custom_service_not_found');
          }
          const nextCustom = (cur.custom_services || []).filter(c => c.id !== command.service_id);
          const nextOrder = cur.service_order.filter(id => id !== command.service_id);
          const nextHidden = cur.hidden_services.filter(id => id !== command.service_id);
          const nextZoom = { ...cur.zoom_levels };
          for (const k of Object.keys(nextZoom)) {
            if (k === command.service_id || k === `default_${command.service_id}` || k.includes(command.service_id)) {
              delete nextZoom[k];
            }
          }
          // Save preferences first; if writing preferences fails, no engine state/profiles are modified
          savePreferences(() => preferences.update({
            custom_services: nextCustom,
            service_order: nextOrder,
            hidden_services: nextHidden,
            zoom_levels: nextZoom
          }));
          try {
            await engine.deleteCustomService(command.service_id);
            permissionStore.deleteScope(command.service_id);
          } catch (delErr) {
            try {
              savePreferences(() => preferences.update({
                custom_services: cur.custom_services,
                service_order: cur.service_order,
                hidden_services: cur.hidden_services,
                zoom_levels: cur.zoom_levels
              }));
            } catch {}
            throw delErr;
          }
          return { ok: true, service_id: command.service_id };
        });
      }
      default: throw new Error('invalid_command');
    }
  } });
  downloadPanel=new DownloadPanel({window,createView:localView,file:uiFile('downloads_panel'),ipc});
  window.on('blur',hideDownloadPanel);
  updates = createUpdates({app,nativeUpdater:electron.autoUpdater,releaseQA,receiptFile:path.join(root,'update_receipt_v1.json'),changed:state => {ipc.broadcast('updates',state); updateNotice?.sync(state);},canRestart:() => engine.enqueue(async () => { for (const owner of engine.owners.values()) if (!await owner.confirmClose()) return false; return true; }),prepareQuit:() => {quitting = true;},undoPrepareQuit:() => {quitting = false;} });
  // Dev fixtures have no update notice WebContents and never contact Releases.
  if (app.isPackaged) { const file = uiFile('update_notice'); updateNotice = new UpdateNotice({window,view:localView(file),file,ipc}); }
  shellView.webContents.once('did-finish-load', changed);
  window.on('resize', resize); window.on('move', scheduleBoundsSave); resize();
  await shellView.webContents.loadFile(shellFile); engine.start(); resize();
  await recordReleaseQA(app,session,releaseQA);
  if (app.isPackaged) void updates.check();
  window.on('close', event => { windowState?.recordWindow(window); if (!quitting) { event.preventDefault(); window.hide(); } });
  window.on('closed', () => {
    for (const utility of secondary.values()) if (!utility.isDestroyed()) utility.destroy();
    downloadPanel?.dispose();updateNotice?.dispose(); updates?.dispose(); ipc(); engine.dispose(); downloads.dispose(); if (!shellView.webContents.isDestroyed()) shellView.webContents.close({ waitForBeforeUnload: false }); window = null;
  });
  app.setAboutPanelOptions({ applicationName: 'VXChat', applicationVersion: app.getVersion(), credits: `${product.author}\n${product.repository}`, authors: [product.author], website: product.repository, iconPath: path.join(__dirname, '../../icon.png') });
  buildMenu();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { window.show(); window.focus(); } });
  const ready = app.whenReady().then(createWindow); module.exports.ready = ready;
  ready.catch(error => { if (qaProfile) { console.error(error.stack); app.exit(1); return; } dialog.showErrorBox('VXChat', t('startupFailed')); quitting = true; engine?.dispose(); downloads?.dispose(); app.quit(); });
  app.on('activate', () => { if (window) window.show(); });
  app.on('before-quit', event => {
    windowState?.recordWindow(window);
    if (quitting || !engine) return;
    event.preventDefault(); if (quitPending) return; quitPending = true;
    void engine.enqueue(async () => {
      for (const owner of engine.owners.values()) if (!await owner.confirmClose()) return;
      windowState?.recordWindow(window);
      quitting = true;
      for (const utility of secondary.values()) if (!utility.isDestroyed()) utility.destroy();
      engine.dispose(); downloads.dispose(); app.quit();
    }).catch(() => {}).finally(() => { quitPending = false; });
  });
  app.on('window-all-closed', () => app.quit());
}
