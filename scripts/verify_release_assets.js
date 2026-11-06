'use strict';
// Checks the app inside the archive that will actually ship. Never installs it.
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const {execFileSync} = require('node:child_process');
const {binaries} = require('./verify_packaged_runtime');
const archive = path.resolve(process.argv[2] || ''); const arch = process.argv[3];
if (process.platform !== 'darwin' || !archive.endsWith('.zip') || !fs.statSync(archive).isFile() || !['arm64','x64'].includes(arch)) throw new Error('Expected macOS ZIP and arm64/x64 target');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(),'vxchat_archive_'));
try {
  execFileSync('ditto',['-x','-k',archive,scratch]);
  const app = path.join(scratch,'VXChat.app');
  const identity = require('../packaging/signing_identity.json');
  for (const file of binaries(app)) require('./check_runtime_sdk').checkRuntimeSDK(file);
  execFileSync('codesign',['--verify','--deep','--strict','--verbose=2',app],{stdio:'inherit'});
  execFileSync('codesign',['--verify','-R',`=identifier "com.vxutilities.vxmesschat" and certificate leaf = H"${identity.certificate_sha1}"`,app],{stdio:'inherit'});
  const plist = path.join(app,'Contents/Info.plist');
  const read = key => execFileSync('/usr/libexec/PlistBuddy',['-c',`Print :${key}`,plist],{encoding:'utf8'}).trim();
  if (read('CFBundleShortVersionString') !== require('../package.json').version || read('CFBundleIdentifier') !== 'com.vxutilities.vxmesschat' || read('CFBundleName') !== 'VXChat') throw new Error('metadata_mismatch');
  const architectures = execFileSync('lipo',['-archs',path.join(app,'Contents/MacOS/VXChat')],{encoding:'utf8'}).trim().split(/\s+/);
  if (architectures.join() !== (arch === 'arm64' ? 'arm64' : 'x86_64')) throw new Error('architecture_mismatch');
  const entries = require('@electron/asar').listPackage(path.join(app,'Contents/Resources/app.asar'));
  if (entries.includes('/src/core/release_qa_build.json')) throw new Error('QA target must never ship as a public release');
  if (entries.some(entry => /^\/(?:docs|legacy|tests|scripts|packaging|\.git)(?:\/|$)/.test(entry))) throw new Error('private_or_legacy_content_in_archive');
  console.log(JSON.stringify({result:'PASS',archive:path.basename(archive),version:read('CFBundleShortVersionString'),architecture:arch,pinned_identity_and_approved_sdk:true,notarized:false,installed:false}));
} finally {fs.rmSync(scratch,{recursive:true,force:true});}
