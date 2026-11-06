'use strict';
const fs = require('node:fs');const os = require('node:os');const path = require('node:path');const net = require('node:net');const {randomBytes} = require('node:crypto');
const root = fs.mkdtempSync(path.join(os.tmpdir(),'vxchat_release_fixture_'));const source = path.join(root,'target_source');fs.mkdirSync(source);
const port = () => new Promise((resolve,reject) => {const server = net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',() => {const p = server.address().port;server.close(() => resolve(p));});});
(async () => {
  const feedPort = await port(); const debugPort = await port();
  for (const entry of ['src','scripts','packaging','package.json','package-lock.json','electron_builder.config.js','icon.png','icon.icns','icon.ico']) fs.cpSync(path.resolve(entry),path.join(source,entry),{recursive:true,verbatimSymlinks:true});
  fs.symlinkSync(path.resolve('node_modules'),path.join(source,'node_modules'),'dir');
  const pkg = JSON.parse(fs.readFileSync(path.join(source,'package.json')));pkg.version = '1.0.1';fs.writeFileSync(path.join(source,'package.json'),JSON.stringify(pkg,null,2));
  fs.writeFileSync(path.join(source,'src/core/release_qa_build.json'),JSON.stringify({profile:root,debug_port:debugPort}));
  fs.writeFileSync(path.join(root,'release_qa_v1.json'),JSON.stringify({schema_version:1,feed_url:`http://127.0.0.1:${feedPort}/vxchat_fixture/`,cookie_nonce:randomBytes(16).toString('hex')}),{mode:0o600});
  const state = require('../src/core/state_store').initialState();state.tabs = [];state.active_tab_id = null;fs.writeFileSync(path.join(root,'tabs_state_v2.json'),JSON.stringify(state));
  // The installed baseline is published 1.0.0, which only understands schema2.
  // Let the new binary perform its normal migration after native relaunch.
  const {service_order:_order,hidden_services:_hidden,...baselinePreferences}=require('../src/core/preferences_store').DEFAULTS;
  fs.writeFileSync(path.join(root,'preferences_v1.json'),JSON.stringify({...baselinePreferences,schema_version:2,theme:'black',language:'en'}));
  const context = {root,source,feed_port:feedPort,debug_port:debugPort,created_at:new Date().toISOString()};
  const output = path.resolve(process.argv[2]);fs.writeFileSync(output,JSON.stringify(context,null,2)+'\n');console.log(JSON.stringify({context_file:output,qa_source:source,real_profile_used:false}));
})().catch(error => {fs.rmSync(root,{recursive:true,force:true});console.error(error.message);process.exitCode = 1;});
