'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os'); const {EventEmitter} = require('node:events');
const {PreferencesStore,DEFAULTS} = require('../src/core/preferences_store');
const {DownloadRegistry} = require('../src/main/download_registry'); const {imageSource} = require('../src/main/image_viewer'); const {validCommand} = require('../src/main/ipc');
test('launcher preferences migrate schema2, validate fixed order and persist hiding without sharing mutable arrays', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vxchat_launcher_'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'prefs.json');
  const {service_order,hidden_services,...old}=DEFAULTS;old.schema_version=2;old.language='en';old.zoom_levels={default_chatgpt:1.25};
  fs.writeFileSync(file,JSON.stringify(old));const store=new PreferencesStore(file);
  assert.deepEqual(store.snapshot().service_order,['messenger','zalo','slack','chatgpt','gmail','gemini','meet']);assert.equal(store.snapshot().zoom_levels.default_chatgpt,1.25);
  const order=['chatgpt','slack','messenger','zalo','gemini','gmail','meet'];store.update({service_order:order,hidden_services:['slack']});order[0]='invalid';
  const loaded=new PreferencesStore(file);assert.deepEqual(loaded.snapshot().service_order,['chatgpt','slack','messenger','zalo','gemini','gmail','meet']);assert.deepEqual(loaded.snapshot().hidden_services,['slack']);
  const snapshot=loaded.snapshot();snapshot.service_order.reverse();snapshot.hidden_services.push('zalo');assert.deepEqual(loaded.snapshot().hidden_services,['slack']);
  const before=fs.readFileSync(file,'utf8');
  for(const patch of [{service_order:['chatgpt']},{service_order:['chatgpt','zalo','slack','slack','gmail','gemini','meet']},{hidden_services:['unknown']},{hidden_services:['slack','slack']}]){assert.throws(()=>loaded.update(patch));assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(validCommand({action:'preferences_update',patch}),false);}
  assert.equal(validCommand({action:'preferences_update',patch:{service_order:['chatgpt','slack','messenger','zalo','gemini','gmail','meet'],hidden_services:[]}}),true);
  loaded.update({hidden_services:[...DEFAULTS.service_order]});assert.equal(loaded.snapshot().hidden_services.length,DEFAULTS.service_order.length);
  assert.deepEqual(loaded.reset().service_order,DEFAULTS.service_order);assert.deepEqual(loaded.snapshot().hidden_services,[]);assert.equal(loaded.snapshot().language,'en');
});
test('v1.0.1 4-service state and preferences migrate additively to include Google services', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'vxchat_google_mig_')); t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  const { StateStore, initialState } = require('../src/core/state_store');
  const { ServiceState, initialServiceState } = require('../src/core/service_state');
  const { windowPurpose, serviceScopeDecision } = require('../src/core/service_scope');
  const prefFile = path.join(dir,'prefs.json');
  fs.writeFileSync(prefFile, JSON.stringify({ ...DEFAULTS, service_order: ['messenger','zalo','slack','chatgpt'] }));
  assert.deepEqual(new PreferencesStore(prefFile).snapshot().service_order, ['messenger','zalo','slack','chatgpt','gmail','gemini','meet']);
  const stateFile = path.join(dir,'state.json');
  const legacyState = initialState();
  legacyState.instances = legacyState.instances.slice(0, 4);
  legacyState.tabs = legacyState.tabs.slice(0, 4);
  fs.writeFileSync(stateFile, JSON.stringify(legacyState));
  const loadedState = new StateStore(stateFile).load();
  assert.equal(loadedState.instances.length, 7);
  assert.equal(loadedState.instances.find(i => i.id === 'default_gmail').partition, 'persist:service-google');
  assert.equal(loadedState.instances.find(i => i.id === 'default_gemini').partition, 'persist:service-google');
  assert.equal(loadedState.instances.find(i => i.id === 'default_meet').partition, 'persist:service-google');
  const svcFile = path.join(dir,'service.json');
  const legacySvc = initialServiceState();
  legacySvc.entries = legacySvc.entries.slice(0, 4);
  fs.writeFileSync(svcFile, JSON.stringify(legacySvc));
  const svc = new ServiceState(svcFile);
  assert.equal(svc.entry('default_gmail').setup_confirmed, false);
  assert.equal(svc.entry('default_gemini').setup_confirmed, false);
  assert.equal(svc.entry('default_meet').setup_confirmed, false);
  assert.equal(windowPurpose('gmail', 'https://meet.google.com/abc-defg-hij'), 'call');
  assert.equal(windowPurpose('gemini', 'https://meet.google.com/abc-defg-hij'), 'call');
  assert.equal(serviceScopeDecision('gmail', 'https://meet.google.com/abc-defg-hij', { purpose: 'call' }), 'allow');
  assert.equal(serviceScopeDecision('gmail', 'https://meet.google.com/abc-defg-hij', { purpose: 'primary' }), 'external');
});
test('WindowStateStore persists fit-screen bounds and clamps off-screen coordinates safely', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_winstate_')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { WindowStateStore, DEFAULT_BOUNDS } = require('../src/core/window_state');
  const file = path.join(dir, 'window_state_v1.json');
  const first = new WindowStateStore(file);
  assert.deepEqual(first.restore(), { ...DEFAULT_BOUNDS, maximized: false, full_screen: false });
  first.recordWindow({ isDestroyed: () => false, isMaximized: () => false, isFullScreen: () => false, getBounds: () => ({ x: 0, y: 25, width: 1728, height: 1055 }) });
  const reloaded = new WindowStateStore(file);
  const screen = { getAllDisplays: () => [{ workArea: { x: 0, y: 25, width: 1728, height: 1055 } }], getPrimaryDisplay: () => ({ workArea: { x: 0, y: 25, width: 1728, height: 1055 } }) };
  assert.deepEqual(reloaded.restore(screen), { x: 0, y: 25, width: 1728, height: 1055, maximized: false, full_screen: false });
  const offscreen = { getAllDisplays: () => [{ workArea: { x: 0, y: 25, width: 1440, height: 900 } }], getPrimaryDisplay: () => ({ workArea: { x: 0, y: 25, width: 1440, height: 900 } }) };
  reloaded.save({ x: 5000, y: 5000, width: 1728, height: 1055 });
  assert.deepEqual(new WindowStateStore(file).restore(offscreen), { width: 1440, height: 900, maximized: false, full_screen: false });
});
test('schema1 preferences migrate additively and preserve sign-in independent settings', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'vxchat_prefs_')); t.after(() => fs.rmSync(dir,{recursive:true,force:true})); const file = path.join(dir,'prefs.json');
  fs.writeFileSync(file,JSON.stringify({schema_version:1,theme:'black',language:'en',slack_workspace_url:'https://app.slack.com/client/T123'}));
  const store = new PreferencesStore(file); assert.deepEqual(store.snapshot(),{...DEFAULTS,theme:'black',language:'en',slack_workspace_url:'https://app.slack.com/client/T123'});
  store.update({zoom_levels:{default_chatgpt:1.25},ask_download_location:false}); assert.equal(new PreferencesStore(file).snapshot().zoom_levels.default_chatgpt,1.25);
  const snapshot = store.snapshot(); snapshot.zoom_levels.default_chatgpt = 9; assert.equal(store.snapshot().zoom_levels.default_chatgpt,1.25);
  assert.throws(() => store.update({zoom_levels:{default_chatgpt:9}})); assert.throws(() => store.update({zoom_levels:{foreign:1}}));
  assert.deepEqual(store.reset(),{...DEFAULTS,language:'en'});
});
test('automatic save reserves a unique file and cancellation preserves pre-existing data', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'vxchat_download_')); t.after(() => fs.rmSync(dir,{recursive:true,force:true})); fs.writeFileSync(path.join(dir,'image.png'),'existing');
  const registry = new DownloadRegistry({shell:{},directory:dir,getPreferences:() => ({ask_download_location:false})});
  const item = new EventEmitter(); Object.assign(item,{getFilename:() => 'image.png',setSavePath:p => {item.file = p;},getReceivedBytes:() => 0,getTotalBytes:() => 0,cancel:() => item.emit('done',{},'cancelled')});
  registry.track({tab:{id:'tab'},instance:{service_id:'messenger'},downloads:new Set()},item); assert.equal(path.basename(item.file),'image (1).png'); item.cancel();
  assert.equal(fs.readFileSync(path.join(dir,'image.png'),'utf8'),'existing'); assert.equal(fs.existsSync(item.file),false);
});
test('image sources and Settings IPC cannot smuggle local paths or foreign blob origins', () => {
  const origin = 'https://www.facebook.com/messages/t/123';
  assert.equal(imageSource('blob:https://www.facebook.com/123',origin),'blob:https://www.facebook.com/123');
  for (const value of ['file:///etc/passwd','javascript:alert(1)','data:text/html,x','blob:https://evil.test/123','https://user:secret@example.test']) assert.equal(imageSource(value,origin),null);
  assert.equal(validCommand({action:'preferences_update',patch:{download_directory:'/tmp/arbitrary'}}),false);
  assert.equal(validCommand({action:'zoom_update',instance_id:'default_slack',factor:1.25}),true);
  assert.equal(validCommand({action:'zoom_update',instance_id:'default_slack',factor:25}),false);
});
test('Tab overflow calculation handles capacity, edge budgets and preserves active tab visibility', () => {
  const { calculateTabOverflow } = require('../src/shell/tab_overflow');

  assert.deepEqual(calculateTabOverflow({ groupWidths: [], availableWidth: 500 }), {
    overflow: false,
    overflowCount: 0,
    visibleIndices: [],
    overflowIndices: []
  });

  const fits = calculateTabOverflow({
    groupWidths: [100, 100, 100],
    availableWidth: 400,
    activeIndex: 0
  });
  assert.equal(fits.overflow, false);
  assert.equal(fits.overflowCount, 0);
  assert.deepEqual(fits.visibleIndices, [0, 1, 2]);
  assert.deepEqual(fits.overflowIndices, []);

  const overflowFirst = calculateTabOverflow({
    groupWidths: [100, 100, 100, 100],
    availableWidth: 300,
    activeIndex: 0,
    pillWidth: 56,
    gap: 3
  });
  assert.equal(overflowFirst.overflow, true);
  assert.equal(overflowFirst.overflowCount, 2);
  assert.deepEqual(overflowFirst.visibleIndices, [0, 1]);
  assert.deepEqual(overflowFirst.overflowIndices, [2, 3]);

  const overflowActiveFar = calculateTabOverflow({
    groupWidths: [100, 100, 100, 100],
    availableWidth: 300,
    activeIndex: 3,
    pillWidth: 56,
    gap: 3
  });
  assert.equal(overflowActiveFar.overflow, true);
  assert.equal(overflowActiveFar.overflowCount, 2);
  assert.ok(overflowActiveFar.visibleIndices.includes(3), 'Active tab index 3 must remain visible');
  assert.deepEqual(overflowActiveFar.visibleIndices, [0, 3]);
  assert.deepEqual(overflowActiveFar.overflowIndices, [1, 2]);

  const standard7 = calculateTabOverflow({
    groupWidths: [110, 110, 110, 110, 110, 110, 110],
    availableWidth: 550,
    activeIndex: 5,
    pillWidth: 56,
    gap: 3
  });
  assert.equal(standard7.overflow, true);
  assert.ok(standard7.overflowCount >= 2);
  assert.ok(standard7.visibleIndices.includes(5), 'Active tab must be visible');
});
