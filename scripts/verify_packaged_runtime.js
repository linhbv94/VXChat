'use strict';
const fs = require('node:fs'); const path = require('node:path'); const {execFileSync} = require('node:child_process');
const MAGIC = new Set(['cffaedfe','feedfacf','cefaedfe','feedface','cafebabe','bebafeca','cafebabf','bfbafeca']);
const {checkRuntimeSDK} = require('./check_runtime_sdk');
function binaries(root) {
  return fs.readdirSync(root,{withFileTypes:true}).flatMap(e => {
    const file = path.join(root,e.name); if (e.isSymbolicLink()) return [];
    if (e.isDirectory()) return binaries(file); if (!e.isFile()) return [];
    const fd = fs.openSync(file,'r'); const buffer = Buffer.alloc(4); try {fs.readSync(fd,buffer,0,4,0);} finally {fs.closeSync(fd);}
    return MAGIC.has(buffer.toString('hex')) ? [file] : [];
  });
}
module.exports = async context => {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir,`${context.packager.appInfo.productFilename}.app`);
  const checks = binaries(app).map(checkRuntimeSDK);
  console.log(JSON.stringify({runtime_sdk_checks:checks,workspace_baseline_changed:false}));
  await require('./sign_macos_app')(app);
};
module.exports.binaries = binaries;
