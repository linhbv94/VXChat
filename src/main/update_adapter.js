'use strict';
const { UpdateController } = require('../core/update_controller');
const { readJSON, writeJSON } = require('../core/atomic_json');
function createUpdates({ app, nativeUpdater, receiptFile, changed, canRestart, prepareQuit, undoPrepareQuit, releaseQA = null }) {
  let adapter = null;
  if (app.isPackaged && ['darwin','win32'].includes(process.platform)) {
    const lib = require('electron-updater');
    const autoUpdater = releaseQA ? new lib.MacUpdater() : lib.autoUpdater;
    // Preserve the real Electron HTTP executor. Supplying a custom AppAdapter
    // constructor argument deliberately disables it in electron-updater6.
    // Only the QA cache root is overridden, after opt-in/profile validation.
    if (releaseQA) Object.defineProperty(autoUpdater.app,'baseCachePath',{get:() => require('node:path').join(releaseQA.profile,'update_cache')});
    autoUpdater.autoDownload = false; autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false; autoUpdater.allowDowngrade = false;
    // The updater's raw errors may contain a signed download URL. UI receives
    // only controller error codes; never persist those error strings.
    autoUpdater.logger = {info(){},warn(){},error(){},debug(){}};
    autoUpdater.setFeedURL(releaseQA ? {provider:'generic',url:releaseQA.feed} : {provider:'github',owner:'linhbv94',repo:'VXChat',releaseType:'release',private:false});
    const errorListener = () => adapter?.failure?.(); autoUpdater.on('error',errorListener);
    const progressListener = info => adapter?.progress?.(info.percent); autoUpdater.on('download-progress',progressListener);
    let cancellation = null; let disposed = false; let preparing = null;
    adapter = {
      check: async () => { const result = await autoUpdater.checkForUpdates(); cancellation = result?.cancellationToken; return result ? {version:result.updateInfo.version} : null; },
      download: () => autoUpdater.downloadUpdate(cancellation),
      cancel: () => cancellation?.cancel(),
      resetPreparation: () => { preparing = null; autoUpdater.closeServerIfExists?.(); },
      prepare: () => {
        if (process.platform !== 'darwin' || autoUpdater.squirrelDownloadedUpdate) return Promise.resolve();
        if (preparing) return preparing;
        // With autoInstallOnAppQuit=false, downloadUpdate only prepares the
        // authenticated loopback proxy. Ask Squirrel to verify/stage first;
        // unlike quitAndInstall(), this step does not arm an automatic quit.
        preparing = new Promise((resolve,reject) => {
          let timer;
          const done = () => { cleanup(); resolve(); }; const fail = () => { cleanup(); reject(new Error('native_verification_failed')); };
          const cleanup = () => { clearTimeout(timer); nativeUpdater.removeListener('update-downloaded',done); nativeUpdater.removeListener('error',fail); };
          nativeUpdater.once('update-downloaded',done); nativeUpdater.once('error',fail);
          timer = setTimeout(fail,55000);
          try { nativeUpdater.checkForUpdates(); } catch { fail(); }
        });
        return preparing;
      },
      install: () => { if (disposed) throw new Error('disposed'); prepareQuit(); try { autoUpdater.quitAndInstall(false,true); } catch (error) { undoPrepareQuit(); throw error; } },
      recover: () => undoPrepareQuit(),
      dispose: () => { disposed = true; autoUpdater.removeListener('download-progress',progressListener); autoUpdater.removeListener('error',errorListener); }
    };
  }
  const controller = new UpdateController({adapter,version:app.getVersion(),changed,canRestart,receipt: value => writeJSON(receiptFile,{schema_version:1,...value})});
  // A receipt confirms a real relaunch only when the installed version matches.
  // Missing/corrupt receipts never reset profile data or claim success.
  try {
    const r = readJSON(receiptFile);
    if (r.schema_version === 1 && r.status === 'verified_ready_to_handoff') {
      const status = r.to === app.getVersion() ? 'confirmed' : 'restart_unconfirmed';
      writeJSON(receiptFile,{...r,status,observed_version:app.getVersion(),observed_at:new Date().toISOString()});
      controller.set({previous_attempt:status});
    } else if (['confirmed','restart_unconfirmed'].includes(r.status)) controller.set({previous_attempt:r.status});
  } catch {}
  return controller;
}
module.exports = { createUpdates };
