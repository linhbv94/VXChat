'use strict';
const path = require('node:path');const fs = require('node:fs');const identity = require('../packaging/signing_identity.json');
module.exports = async app => {
  const chain = process.env.VXCHAT_SIGNING_KEYCHAIN;
  if (!chain || !fs.statSync(chain).isFile() || identity.mode !== 'self_signed' || !/^[A-F0-9]{40}$/.test(identity.certificate_sha1)) throw new Error('Use macos_signing_session.py with the pinned VXChat identity');
  await require('@electron/osx-sign').signAsync({app,platform:'darwin',identity:identity.certificate_sha1,keychain:chain,identityValidation:false,preAutoEntitlements:false,preEmbedProvisioningProfile:false,strictVerify:true,gatekeeperAssess:false,optionsForFile:() => ({entitlements:path.join(__dirname,'../packaging/macos_entitlements.plist'),hardenedRuntime:true,timestamp:'none'})});
  await require('./verify_signed_app')({electronPlatformName:'darwin',appOutDir:path.dirname(app),packager:{appInfo:{productFilename:path.basename(app,'.app')}}});
};
