'use strict';
module.exports = {
  appId:'com.vxutilities.vxmesschat', productName:'VXChat', executableName:'VXChat',
  asar:true, forceCodeSigning:true,
  directories:{output:'dist'},
  files:['src/**/*','package.json','icon.png'],
  publish:[{provider:'github',owner:'linhbv94',repo:'VXChat',releaseType:'draft'}],
  afterPack:require('./scripts/verify_packaged_runtime'),
  afterSign:require('./scripts/verify_signed_app'),
  mac:{
    // afterPack signs with our pinned identity and verifies strictly. Builder's
    // Apple-only identity discovery must not replace it or fall back ad-hoc.
    identity:null,forceCodeSigning:false,
    target:['dmg','zip'],category:'public.app-category.social-networking',icon:'icon.icns',
    artifactName:'vxchat_${version}_macos_${arch}.${ext}',
    minimumSystemVersion:'14.0',hardenedRuntime:true,notarize:false,
    entitlements:'packaging/macos_entitlements.plist',entitlementsInherit:'packaging/macos_entitlements.plist',
    extendInfo:{LSUIElement:false,NSCameraUsageDescription:'VXChat uses the camera for video calls. VXChat dùng camera cho cuộc gọi video.',NSMicrophoneUsageDescription:'VXChat uses the microphone for calls. VXChat dùng microphone cho cuộc gọi.'}
  },
  win:{target:['nsis'],icon:'icon.ico',artifactName:'vxchat_${version}_windows_${arch}_setup.${ext}',verifyUpdateCodeSignature:true,requestedExecutionLevel:'asInvoker'},
  nsis:{oneClick:false,perMachine:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false}
};
