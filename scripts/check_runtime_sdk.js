'use strict';
const {execFileSync} = require('node:child_process');const policy = require('../packaging/runtime_sdk_exception.json');const pkg = require('../package.json');
function checkRuntimeSDK(binary) {
  const fs = require('node:fs');const path = require('node:path');
  const qaFile = path.join(__dirname,'../src/core/release_qa_build.json');
  const isolatedQA = process.env.VXCHAT_INTERNAL_QA_BUILD === '1' && pkg.version === policy.app_version && fs.existsSync(qaFile) && require(qaFile).profile.includes('vxchat_release_fixture_');
  const applies = pkg.devDependencies.electron === policy.electron_version && (pkg.version === policy.app_version || isolatedQA);
  const metadata = execFileSync('xcrun',['vtool','-show-build',binary],{encoding:'utf8'});
  const sdks = [...metadata.matchAll(/^\s*sdk\s+(\S+)/gm)].map(m => m[1]);
  if (!sdks.length || sdks.some(sdk => sdk !== policy.workspace_sdk && !(applies && sdk === policy.runtime_sdk))) throw new Error(`runtime_sdk_gate_failed: ${binary}: ${sdks.join(',')}`);
  return {binary,sdks,exception:sdks.some(sdk => sdk !== policy.workspace_sdk)};
}
module.exports = {checkRuntimeSDK};
