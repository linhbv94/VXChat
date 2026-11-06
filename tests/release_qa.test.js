'use strict';
const test = require('node:test');const assert = require('node:assert/strict');const fs = require('node:fs');const os = require('node:os');const path = require('node:path');
const {resolveReleaseQA} = require('../src/main/release_qa');
test('packaged QA requires CLI opt-in, owned private temporary profile and loopback feed', t => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'vxchat_release_fixture_'));
  const oldEnv = process.env.VXCHAT_QA_PROFILE;const oldArgs = [...process.argv];
  t.after(() => {if (oldEnv === undefined)delete process.env.VXCHAT_QA_PROFILE;else process.env.VXCHAT_QA_PROFILE=oldEnv;process.argv=oldArgs;fs.rmSync(profile,{recursive:true,force:true});});
  process.env.VXCHAT_QA_PROFILE=profile;
  const app = {isPackaged:true,commandLine:{appendSwitch(){}}};
  assert.throws(()=>resolveReleaseQA(app),/opt_in_required/);process.argv.push('--vxchat-release-qa');
  const control = {schema_version:1,feed_url:'http://127.0.0.1:24567/vxchat_fixture/',cookie_nonce:'a'.repeat(32)};const file=path.join(profile,'release_qa_v1.json');fs.writeFileSync(file,JSON.stringify(control));
  assert.equal(resolveReleaseQA(app).profile,profile);
  for(const feed_url of ['https://example.test/','http://localhost:24567/vxchat_fixture/','http://127.0.0.1:24567/vxchat_fixture/?token=x','http://127.0.0.1:24567/other/']){fs.writeFileSync(file,JSON.stringify({...control,feed_url}));assert.throws(()=>resolveReleaseQA(app),/invalid_release_qa_feed/);}
  fs.writeFileSync(file,JSON.stringify(control));fs.chmodSync(profile,0o755);assert.throws(()=>resolveReleaseQA(app),/invalid_release_qa_profile/);
});
