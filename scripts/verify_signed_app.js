'use strict';
const path = require('node:path'); const {execFileSync} = require('node:child_process');
module.exports = async context => {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir,`${context.packager.appInfo.productFilename}.app`);
  const identity = require('../packaging/signing_identity.json');
  execFileSync('codesign',['--verify','--deep','--strict','--verbose=2',app],{stdio:'inherit'});
  const details = execFileSync('codesign',['-d','-r-','--verbose=4',app],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  // codesign diagnostics are on stderr; verify the actual requirement directly.
  execFileSync('codesign',['--verify','-R',`=identifier "com.vxutilities.vxmesschat" and certificate leaf = H"${identity.certificate_sha1}"`,app],{stdio:'inherit'});
  void details;
};
