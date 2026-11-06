'use strict';

// Hermetic native test: temporary Chromium profile and synthetic documents only.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const electron = require('electron');
const { app, BaseWindow, session,webContents } = electron;
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
  // Repeatedly allocate/commit/touch renderer memory, then close every owner.
  // Track native contents AND processes: Chromium may keep a warm spare, so
  // process existence alone is not an ownership leak.
  const samples=[];
  const sample=(phase,round)=>{
    const metrics=app.getAppMetrics();const processes=metrics.map(m=>({pid:m.pid,type:m.type,working_set_kib:m.memory?.workingSetSize||0}));
    const data={phase,round,contents:webContents.getAllWebContents().length,owners:engine.owners.size,registry:registry.size,child_views:window.contentView.children.length,
      process_count:processes.length,renderer_count:processes.filter(p=>p.type==='Tab').length,working_set_mib:processes.reduce((n,p)=>n+p.working_set_kib,0)/1024,main_heap_used_mib:process.memoryUsage().heapUsed/1048576,processes};samples.push(data);return data;
  };
  // Restart an empty engine with the same bounded SessionPolicy cache.
  const store=new StateStore(path.join(temporary,'cycles.json'));
  store.save({...require('../src/core/state_store').initialState(),tabs:[],active_tab_id:null});
  engine=new TabEngine({store,createOwner:args=>{
    const owned=new ContentOwner({...args,electron:testElectron,window,sessionPolicy:policy,register:(wc,o)=>registry.set(wc,o),unregister:wc=>registry.delete(wc)});
    owned.load=()=>pending.push(owned.view.webContents.loadURL(fixture));return owned;
  }});engine.start();
  await new Promise(r=>setTimeout(r,500));sample('baseline',0);
  for(let round=1;round<=12;round++){
    const ids=[];
    for(let n=0;n<3;n++)ids.push(await engine.add('chatgpt'));
    await Promise.all(pending.splice(0));
    const cycleContents=ids.map(id=>engine.owners.get(id).view.webContents);
    for(const wc of cycleContents)await wc.executeJavaScript('globalThis.fixtureAllocation=new Uint8Array(16*1024*1024);fixtureAllocation.fill(42);document.querySelector("#draft").value="synthetic draft"');
    sample('open',round);
    const closed=cycleContents.map(wc=>once(wc,'destroyed'));
    for(const id of ids)await engine.close(id);await Promise.all(closed);
    await new Promise(r=>setTimeout(r,350));
    const after=sample('closed',round);
    assert.equal(after.contents,0);assert.equal(after.owners,0);assert.equal(after.registry,0);assert.equal(after.child_views,0);
    assert.ok(cycleContents.every(wc=>wc.isDestroyed()));assert.equal(policy.configured.size,4,'Persistent service sessions must remain bounded by instances');
  }
  await new Promise(r=>setTimeout(r,1500));const final=sample('settled',12);
  const report={result:'PASS',cycles:12,views_opened_closed:36,allocation_mib_per_view:16,final,closed_samples:samples.filter(s=>s.phase==='closed'),samples,
    limitation:'Bounded synthetic lifecycle/RSS observations; not a long-duration live-provider heap or physical-footprint proof. Persistent sessions and GPU/network/main processes are intentional.'};
  if(process.env.VXCHAT_QA_OUTPUT)fs.writeFileSync(path.join(process.env.VXCHAT_QA_OUTPUT,'lifecycle_memory.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({memory_cycles:12,views_opened_closed:36,final_contents:final.contents,final_registry:final.registry,final_renderer_processes:final.renderer_count,baseline_working_set_mib:samples[0].working_set_mib,final_working_set_mib:final.working_set_mib,closed_working_set_mib:report.closed_samples.map(s=>s.working_set_mib)}));
  console.log(JSON.stringify({ result: 'PASS', electron: process.versions.electron, chromium: process.versions.chrome, independent_ai_views: true, shared_ai_session: true, draft_survived_20_switches: true, popup_and_contents_disposed: true, real_profiles_used: false }));
}).catch(error => {
  console.error(error.stack); failed = true;
}).finally(() => {
  clearTimeout(timeout);
  if (engine) engine.dispose();
  if (window && !window.isDestroyed()) window.destroy();
  app.exit(failed ? 1 : 0);
});
