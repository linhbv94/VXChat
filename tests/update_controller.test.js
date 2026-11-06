'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const {UpdateController,newerStable} = require('../src/core/update_controller');
function fixture(overrides = {}) {
  const calls = []; const adapter = { check:async () => {calls.push('check'); return {version:'1.0.1'};},download:async () => {calls.push('download');},prepare:async () => {calls.push('verified');},install:() => {calls.push('install');},cancel:() => {calls.push('cancel');},dispose:() => {},...overrides };
  const controller = new UpdateController({adapter,version:'1.0.0',receipt:value => calls.push(['receipt',value.status]),checkTimeout:30,downloadTimeout:30,handoffTimeout:30});
  return {controller,adapter,calls};
}
test('only strictly greater stable versions are eligible', () => {
  for (const v of ['0.9.9','1.0.0','1.0.1-beta','v1.0.1','1.01.0','999999999999999999.0.0',null]) assert.equal(newerStable(v,'1.0.0'),false);
  for (const v of ['1.0.1','1.1.0','2.0.0']) assert.equal(newerStable(v,'1.0.0'),true);
});
test('check/dismiss never downloads or arms quit; repeated UI checks remain single-flight', async () => {
  const {controller,calls} = fixture(); await Promise.all([controller.check(),controller.check()]); controller.dismiss();
  assert.deepEqual(calls,['check']); assert.equal(controller.snapshot().dismissed,true);
  await controller.check(); assert.equal(controller.snapshot().dismissed,true);
});
test('one CTA job verifies and records a native-ready receipt before handing off; no false installed state', async () => {
  const {controller,calls} = fixture(); await controller.check(); await Promise.all([controller.install(),controller.install()]);
  assert.deepEqual(calls,['check','download','verified',['receipt','verified_ready_to_handoff'],'install']); assert.equal(controller.snapshot().state,'restarting');
});
test('busy guard before restart preserves a downloaded payload for a later explicit retry', async () => {
  const {controller,calls} = fixture(); let guard = 0; controller.canRestart = async () => ++guard !== 2;
  await controller.check(); await controller.install(); assert.equal(controller.snapshot().state,'ready'); assert.equal(calls.includes('install'),false);
  controller.canRestart = async () => true; await controller.install(); assert.equal(calls.filter(c => c === 'download').length,1); assert.equal(calls.includes('install'),true);
});
test('verification or receipt failure cannot install or claim success', async () => {
  for (const failure of ['verify','receipt']) {
    const {controller,calls} = fixture(failure === 'verify' ? {prepare:async () => {throw new Error('private_url_must_not_escape');}} : {});
    if (failure === 'receipt') controller.receipt = () => {throw new Error('disk');};
    await controller.check(); await controller.install(); assert.equal(calls.includes('install'),false); assert.equal(controller.snapshot().state,'error'); assert.ok(!JSON.stringify(controller.snapshot()).includes('private_url'));
  }
});
test('check timeout is finite and ignores late results without spawning another live request', async () => {
  let finish; const {controller,calls} = fixture({check:() => {calls.push('check'); return new Promise(resolve => {finish = resolve;});}});
  await controller.check(); assert.equal(controller.snapshot().error,'check_timeout'); await controller.check(); assert.equal(calls.length,1);
  finish({version:'9.0.0'}); await new Promise(r => setImmediate(r)); assert.equal(controller.snapshot().state,'error');
});
test('download timeout cancels its job and never verifies or installs', async () => {
  const {controller,calls} = fixture({download:() => new Promise(() => {})}); await controller.check(); await controller.install(); assert.equal(controller.snapshot().error,'update_timeout'); assert.equal(calls.includes('cancel'),true); assert.equal(calls.includes('install'),false);
});
test('unpackaged builds never check a feed or pretend current', async () => {
  const controller = new UpdateController({adapter:null,version:'1.0.0'}); await controller.check(); await controller.install(); assert.equal(controller.snapshot().state,'unsupported');
});
test('an unconfirmed handoff cannot start a second installer while the old process remains alive', async () => {
  const {controller,calls} = fixture(); controller.handoffTimeout = 10;
  await controller.check(); await controller.install(); await new Promise(r => setTimeout(r,20));
  assert.equal(controller.snapshot().error,'handoff_unconfirmed'); assert.equal(controller.snapshot().requires_restart,true);
  await controller.install(); await controller.check(); assert.equal(calls.filter(c => c === 'install').length,1); controller.dispose();
});
test('disposing while a busy permission guard is pending cannot download later', async () => {
  const {controller,calls} = fixture(); let finish;
  controller.canRestart = () => new Promise(resolve => {finish = resolve;});
  await controller.check(); const job = controller.install(); await new Promise(r => setImmediate(r)); controller.dispose(); finish(true); await job;
  assert.equal(calls.includes('download'),false); assert.equal(calls.includes('install'),false);
});
test('native verification failure permits a later explicit retry with fresh metadata and payload', async () => {
  let reject = true;const {controller,calls,adapter} = fixture({prepare:async()=>{if(reject)throw new Error('signature_invalid');},resetPreparation:()=>calls.push('reset')});
  await controller.check();await controller.install();assert.equal(controller.snapshot().state,'error');assert.equal(calls.includes('install'),false);assert.equal(calls.includes('reset'),true);
  reject=false;await controller.install();assert.equal(calls.filter(c=>c==='check').length,2);assert.equal(calls.filter(c=>c==='download').length,2);assert.equal(calls.filter(c=>c==='install').length,1);controller.dispose();
});
