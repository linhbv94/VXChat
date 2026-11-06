'use strict';
const path = require('node:path'); const {execFileSync} = require('node:child_process');
const platform = process.argv[2] || process.platform;
if (!['darwin','win32'].includes(platform)) throw new Error('Supported release platforms: darwin, win32');
if (platform !== process.platform) throw new Error('Build on the target OS; no unverified cross-signing fallback');
if (platform === 'darwin') {
  execFileSync('python3',[path.join(__dirname,'check_macos_sdk.py')],{stdio:'inherit'});
  // Reject a prebuilt runtime with a different SDK before packaging/signing it.
  const runtime = process.env.VXCHAT_ELECTRON_DIST || path.join(__dirname,'../node_modules/electron/dist');
  require('./check_runtime_sdk').checkRuntimeSDK(path.join(runtime,'Electron.app/Contents/MacOS/Electron'));
}
const arch = process.argv[3] || process.arch;
if (!['arm64','x64','all'].includes(arch) || (platform !== 'darwin' && arch === 'all')) throw new Error('Unsupported architecture');
const args = [require.resolve('electron-builder/cli.js'),'--config',path.join(__dirname,'../electron_builder.config.js'),'--publish','never',platform === 'darwin' ? '--mac' : '--win',...(arch === 'all' ? ['--arm64','--x64'] : [`--${arch}`])];
if (process.env.VXCHAT_ELECTRON_DIST) args.push(`-c.electronDist=${path.resolve(process.env.VXCHAT_ELECTRON_DIST)}`);
if (platform === 'darwin' && !process.env.VXCHAT_SIGNING_KEYCHAIN) {
  const output = path.join(__dirname,'../dist'); require('node:fs').mkdirSync(output,{recursive:true});
  execFileSync('python3',[path.join(__dirname,'macos_signing_session.py'),'--evidence',path.join(output,'signing_session_result.json'),'--',process.execPath,...args],{stdio:'inherit'});
}
else execFileSync(process.execPath,args,{stdio:'inherit'});
if (platform === 'darwin') execFileSync(process.execPath,[path.join(__dirname,'write_macos_manifest.js'),path.join(__dirname,'../dist')],{stdio:'inherit'});
if (platform === 'darwin') for (const target of (arch === 'all' ? ['arm64','x64'] : [arch])) execFileSync(process.execPath,[path.join(__dirname,'verify_release_assets.js'),path.join(__dirname,`../dist/vxchat_${require('../package.json').version}_macos_${target}.zip`),target],{stdio:'inherit'});
