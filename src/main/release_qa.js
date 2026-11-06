'use strict';
// Local release QA only: explicit CLI opt-in + private, owned temporary profile.
// The production artifact contains no embedded QA control file.
const fs = require('node:fs');const path = require('node:path');const os = require('node:os');
const {readJSON,writeJSON} = require('../core/atomic_json');
function resolveReleaseQA(app) {
  const embedded = path.join(__dirname,'../core/release_qa_build.json');
  let compiled = null; if (fs.existsSync(embedded)) compiled = readJSON(embedded);
  const profile = compiled?.profile || process.env.VXCHAT_QA_PROFILE;
  if (!profile || !app.isPackaged) return null;
  if (!compiled && !process.argv.includes('--vxchat-release-qa')) throw new Error('release_qa_opt_in_required');
  const stat = fs.lstatSync(profile);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid()) || !path.basename(profile).startsWith('vxchat_release_fixture_') || fs.realpathSync(path.dirname(profile)) !== fs.realpathSync(os.tmpdir())) throw new Error('invalid_release_qa_profile');
  const control = readJSON(path.join(profile,'release_qa_v1.json'));
  if (Object.keys(control).sort().join() !== 'cookie_nonce,feed_url,schema_version' || control.schema_version !== 1 || !/^[a-f0-9]{32}$/.test(control.cookie_nonce)) throw new Error('invalid_release_qa_control');
  const url = new URL(control.feed_url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/vxchat_fixture/') throw new Error('invalid_release_qa_feed');
  if (compiled?.debug_port) { if (!Number.isInteger(compiled.debug_port) || compiled.debug_port < 1024 || compiled.debug_port > 65535) throw new Error('invalid_qa_port'); app.commandLine.appendSwitch('remote-debugging-port',String(compiled.debug_port)); }
  return {profile,feed:control.feed_url,nonce:control.cookie_nonce};
}
async function recordReleaseQA(app, session, qa) {
  if (!qa) return;
  const store = session.fromPartition('persist:service-chatgpt').cookies;
  const existing = await store.get({url:'https://vxchat-qa.invalid',name:'vxchat_fixture'});
  const preserved = existing[0]?.value === qa.nonce;
  if (!existing.length) await store.set({url:'https://vxchat-qa.invalid',name:'vxchat_fixture',value:qa.nonce,secure:true,expirationDate:Math.floor(Date.now()/1000)+86400});
  await store.flushStore();
  writeJSON(path.join(qa.profile,'qa_runtime_v1.json'),{schema_version:1,version:app.getVersion(),pid:process.pid,executable:app.getPath('exe'),cookie_preserved:preserved,packaged:app.isPackaged});
}
module.exports = {resolveReleaseQA,recordReleaseQA};
