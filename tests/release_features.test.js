'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os'); const {EventEmitter} = require('node:events');
const {PreferencesStore,DEFAULTS} = require('../src/core/preferences_store');
const {DownloadRegistry} = require('../src/main/download_registry'); const {imageSource} = require('../src/main/image_viewer'); const {validCommand} = require('../src/main/ipc');
test('launcher preferences migrate schema2, validate fixed order and persist hiding without sharing mutable arrays', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vxchat_launcher_'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'prefs.json');
  const {service_order,hidden_services,...old}=DEFAULTS;old.schema_version=2;old.language='en';old.zoom_levels={default_chatgpt:1.25};
  fs.writeFileSync(file,JSON.stringify(old));const store=new PreferencesStore(file);
  assert.deepEqual(store.snapshot().service_order,['messenger','zalo','slack','chatgpt']);assert.equal(store.snapshot().zoom_levels.default_chatgpt,1.25);
  const order=['chatgpt','slack','messenger','zalo'];store.update({service_order:order,hidden_services:['slack']});order[0]='invalid';
  const loaded=new PreferencesStore(file);assert.deepEqual(loaded.snapshot().service_order,['chatgpt','slack','messenger','zalo']);assert.deepEqual(loaded.snapshot().hidden_services,['slack']);
  const snapshot=loaded.snapshot();snapshot.service_order.reverse();snapshot.hidden_services.push('zalo');assert.deepEqual(loaded.snapshot().hidden_services,['slack']);
  const before=fs.readFileSync(file,'utf8');
  for(const patch of [{service_order:['chatgpt']},{service_order:['chatgpt','zalo','slack','slack']},{hidden_services:['unknown']},{hidden_services:['slack','slack']}]){assert.throws(()=>loaded.update(patch));assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(validCommand({action:'preferences_update',patch}),false);}
  assert.equal(validCommand({action:'preferences_update',patch:{service_order:['chatgpt','slack','messenger','zalo'],hidden_services:[]}}),true);
  loaded.update({hidden_services:[...DEFAULTS.service_order]});assert.equal(loaded.snapshot().hidden_services.length,4);
  assert.deepEqual(loaded.reset().service_order,DEFAULTS.service_order);assert.deepEqual(loaded.snapshot().hidden_services,[]);assert.equal(loaded.snapshot().language,'en');
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
