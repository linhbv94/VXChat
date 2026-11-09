'use strict';
const fs = require('node:fs');const path = require('node:path');const http = require('node:http');const {createHash} = require('node:crypto');const {spawn,execFileSync} = require('node:child_process');const {Transform} = require('node:stream');const assert = require('node:assert/strict');
const contextFile = path.resolve(process.argv[2]);const context = JSON.parse(fs.readFileSync(contextFile));const out = path.dirname(contextFile);const {root,source} = context;
if (!path.basename(root).startsWith('vxchat_release_fixture_') || fs.lstatSync(root).isSymbolicLink()) throw new Error('Invalid owned QA fixture');
const targetVersion = require('../package.json').version;
const target = path.join(source,`dist/vxchat_${targetVersion}_macos_arm64.zip`);const old = path.resolve(process.argv[3] || 'dist/mac-arm64/VXChat.app');const installed = path.join(root,'installed/VXChat.app');
const baselineVersion = execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',path.join(old,'Contents/Info.plist')],{encoding:'utf8'}).trim();
assert.notEqual(baselineVersion,targetVersion,`Pass a verified published baseline version explicitly before updating to ${targetVersion}`);
const fileName = path.basename(target);const size = fs.statSync(target).size;const digest = createHash('sha512').update(fs.readFileSync(target)).digest('base64');
const feed = `version: ${targetVersion}\nfiles:\n  - url: ${fileName}\n    sha512: ${digest}\n    size: ${size}\npath: ${fileName}\nsha512: ${digest}\nreleaseDate: '${new Date().toISOString()}'\n`;
let tamper = true;let child;let currentPID;let socket;let failed = false;const requests = [];let phase = 'initial';
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://127.0.0.1');requests.push(url.pathname);
  if (url.pathname.endsWith('/latest-mac.yml')) {res.writeHead(200,{'Content-Type':'text/yaml'});res.end(feed);return;}
  if (url.pathname.endsWith('/'+fileName)) {res.writeHead(200,{'Content-Type':'application/zip','Content-Length':size});const stream = fs.createReadStream(target);if (tamper) {let changed = false;stream.pipe(new Transform({transform(chunk,_enc,callback){if(!changed){chunk[0]^=1;changed=true;}callback(null,chunk);}})).pipe(res);}else stream.pipe(res);return;}
  res.writeHead(404);res.end();
});
const wait = async (predicate,ms = 45000) => {const start = Date.now();while(Date.now()-start < ms){try{const value = await predicate();if(value)return value;}catch{}await new Promise(r => setTimeout(r,200));}throw new Error('Timeout at '+phase);};
let rpcID = 0;const replies = new Map();
async function connect() {
  const pages = await (await fetch(`http://127.0.0.1:${context.debug_port}/json/list`)).json();const page = pages.find(p => p.url.endsWith('/update_notice.html'));if(!page)return false;
  socket = new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event => {const data=JSON.parse(event.data);if(data.id && replies.has(data.id)){const {resolve,reject}=replies.get(data.id);replies.delete(data.id);data.error ? reject(new Error(data.error.message)) : resolve(data.result);}});return true;
}
async function evaluate(expression) {const id = ++rpcID;let timer;const promise=new Promise((resolve,reject)=>{timer=setTimeout(()=>{replies.delete(id);reject(new Error('QA RPC timeout'));},5000);replies.set(id,{resolve,reject});});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true,userGesture:true}}));const result=await promise.finally(()=>clearTimeout(timer));if(result.exceptionDetails)throw new Error('QA renderer evaluation failed');return result.result.value;}
const updateState = () => evaluate('window.vxchat.command({action:"update_state"})');
const memory = label => execFileSync(process.execPath,[path.resolve('scripts/measure_memory.js'),String(currentPID),path.join(out,`memory_packaged_${label}.json`)],{stdio:'inherit'});
(async () => {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(context.feed_port,'127.0.0.1',resolve);});
  fs.mkdirSync(path.dirname(installed),{recursive:true});execFileSync('ditto',[old,installed]);
  execFileSync('codesign',['--verify','--deep','--strict',installed]);
  const log=fs.openSync(path.join(out,'signed_update_app.log'),'a');
  child=spawn(path.join(installed,'Contents/MacOS/VXChat'),['--vxchat-release-qa',`--remote-debugging-port=${context.debug_port}`,'--remote-debugging-address=127.0.0.1'],{env:{...process.env,VXCHAT_QA_PROFILE:root},stdio:['ignore',log,log],detached:true});currentPID=child.pid;fs.closeSync(log);
  phase='connect_baseline';await wait(connect);await wait(async()=> (await updateState()).update?.state === 'available');
  const before=JSON.parse(fs.readFileSync(path.join(root,'qa_runtime_v1.json')));assert.equal(before.version,baselineVersion);memory('before_update');
  phase='tamper_rejection';await evaluate('document.querySelector("button.primary").click()');await wait(async()=> (await updateState()).update?.state === 'error',90000);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'qa_runtime_v1.json'))).version,baselineVersion);assert.equal(fs.existsSync(path.join(root,'update_receipt_v1.json')),false);
  tamper=false;phase='signed_update_and_relaunch';await evaluate('document.querySelector("button.primary").click()');socket.close();socket=null;
  const after=await wait(()=>{const marker=JSON.parse(fs.readFileSync(path.join(root,'qa_runtime_v1.json')));return marker.version === targetVersion ? marker : false;},120000);
  currentPID=after.pid;assert.notEqual(before.pid,after.pid);assert.equal(after.cookie_preserved,true);
  const receipt=JSON.parse(fs.readFileSync(path.join(root,'update_receipt_v1.json')));assert.equal(receipt.status,'confirmed');assert.equal(receipt.from,baselineVersion);assert.equal(receipt.to,targetVersion);
  const prefs=JSON.parse(fs.readFileSync(path.join(root,'preferences_v1.json')));assert.equal(prefs.language,'en');assert.equal(prefs.theme,'black');
  execFileSync('codesign',['--verify','--deep','--strict',installed]);memory('after_update');
  fs.writeFileSync(path.join(root,'signed_update_receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  const report={result:'PASS',from:baselineVersion,to:targetVersion,signed_native_squirrel_install:true,tampered_download_rejected:true,real_restart:true,profile_cookie_preserved:true,settings_preserved:true,real_profile_used:false,applications_replaced:false,requests,installed_path:installed};
  fs.writeFileSync(path.join(out,'signed_update_result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(error=>{failed=true;fs.writeFileSync(path.join(out,'signed_update_result.json'),JSON.stringify({result:'FAIL',phase,error:error.message,requests},null,2)+'\n');console.error(error.stack);}).finally(async()=>{
  socket?.close();for(const entry of replies.values())entry.reject(new Error('QA ended'));replies.clear();
  try {const marker=JSON.parse(fs.readFileSync(path.join(root,'qa_runtime_v1.json')));if(marker.executable.startsWith(path.join(root,'installed/')))process.kill(marker.pid,'SIGTERM');}catch{}
  try {if(child?.pid)process.kill(-child.pid,'SIGTERM');}catch{}
  server.closeAllConnections();server.close();process.exitCode=failed ? 1 : 0;
});
