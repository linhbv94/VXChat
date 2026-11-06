'use strict';
function newerStable(next, current) {
  const parse = value => typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) ? value.split('.').map(Number) : null;
  const a = parse(next); const b = parse(current);
  if (!a || !b || [...a,...b].some(n => !Number.isSafeInteger(n))) return false;
  for (let n = 0; n < 3; n++) { if (a[n] !== b[n]) return a[n] > b[n]; } return false;
}
function deadline(promise, ms, onTimeout = () => {}) {
  let timer;
  return Promise.race([promise, new Promise((_resolve,reject) => { timer = setTimeout(() => { onTimeout(); reject(new Error('update_timeout')); },ms); })]).finally(() => clearTimeout(timer));
}
class UpdateController {
  constructor({ adapter, version, changed = () => {}, canRestart = async () => true, receipt = () => {}, checkTimeout = 15000, downloadTimeout = 300000, handoffTimeout = 60000 }) {
    Object.assign(this,{adapter,version,changed,canRestart,receipt,checkTimeout,downloadTimeout,handoffTimeout});
    this.value = { state:adapter ? 'idle' : 'unsupported', version:null, percent:null, error:null, dismissed:false };
    this.checkInFlight = null; this.job = null; this.selection = null; this.downloaded = false; this.disposed = false;
    if (adapter) adapter.progress = percent => { if (this.job && this.value.state === 'downloading') this.set({percent:Number.isFinite(percent) ? Math.max(0,Math.min(100,percent)) : null}); };
    if (adapter) adapter.failure = () => { if (this.value.state === 'restarting') this.handoffUnconfirmed(); };
  }
  snapshot() { return {...this.value,current_version:this.version}; }
  set(patch) { if (this.disposed) return; this.value = {...this.value,...patch}; this.changed(this.snapshot()); }
  async check() {
    if (!this.adapter || this.disposed || this.job || this.value.state === 'restarting' || this.value.requires_restart) return this.snapshot();
    if (this.checkInFlight) return this.checkInFlight;
    this.set({state:'checking',error:null});
    const raw = Promise.resolve().then(() => this.adapter.check());
    const task = deadline(raw,this.checkTimeout).then(result => {
      if (!result || !newerStable(result.version,this.version)) { this.selection = null; this.set({state:'current',version:null,dismissed:false}); }
      else { const changedVersion = result.version !== this.value.version; this.selection = result; this.downloaded = false; this.set({state:'available',version:result.version,percent:null,error:null,...(changedVersion ? {dismissed:false} : {})}); }
    }).catch(error => this.set({state:'error',error:error.message === 'update_timeout' ? 'check_timeout' : 'check_failed'}));
    // Keep the underlying request single-flight even after the UI deadline.
    this.checkInFlight = task;
    void raw.catch(() => {}).finally(() => { if (this.checkInFlight === task) this.checkInFlight = null; });
    await task; return this.snapshot();
  }
  install() {
    if (this.job) return this.job;
    if (!this.adapter || this.disposed || this.value.state === 'restarting' || this.value.requires_restart || !this.selection || !newerStable(this.selection.version,this.version)) return Promise.resolve(this.snapshot());
    this.job = Promise.resolve().then(async () => {
      if (!await this.canRestart()) { this.set({state:this.downloaded ? 'ready' : 'available',error:'busy'}); return; }
      if (this.disposed) return;
      if (this.value.state === 'error' && !this.downloaded) {
        const fresh = await deadline(this.adapter.check(),this.checkTimeout);
        if (!fresh || !newerStable(fresh.version,this.version)) { this.selection = null; this.set({state:'current',version:null,error:null}); return; }
        this.selection = fresh; this.set({version:fresh.version});
      }
      this.set({state:'downloading',error:null,dismissed:false,percent:null});
      if (!this.downloaded) {
        await deadline(this.adapter.download(this.selection),this.downloadTimeout,() => this.adapter.cancel());
        this.downloaded = true;
      }
      if (this.disposed) return;
      if (!await this.canRestart()) { this.set({state:'ready',error:'busy',percent:null}); return; }
      this.set({state:'verifying',percent:null});
      await deadline(this.adapter.prepare(),this.handoffTimeout);
      if (this.disposed) return;
      if (!await this.canRestart()) { this.set({state:'ready',error:'busy'}); return; }
      if (this.disposed) return;
      // prepare() acknowledges the native install backend is ready, including
      // Squirrel.Mac signature verification. It is not a successful install.
      this.receipt({from:this.version,to:this.selection.version,status:'verified_ready_to_handoff',requested_at:new Date().toISOString()});
      this.set({state:'restarting'});
      this.adapter.install();
      this.handoffTimer = setTimeout(() => this.handoffUnconfirmed(),this.handoffTimeout);
      this.handoffTimer.unref?.();
    }).catch(error => {
      // A rejected native verification must not pin a bad downloaded payload
      // forever. A later explicit retry checks fresh metadata and downloads it.
      if (this.value.state === 'verifying') { this.downloaded = false; this.adapter.resetPreparation?.(); }
      this.set({state:'error',error:error.message === 'update_timeout' ? 'update_timeout' : 'update_failed'});
    }).finally(() => {this.job = null;});
    return this.job.then(() => this.snapshot());
  }
  dismiss() { if (['available','ready','error'].includes(this.value.state)) this.set({dismissed:true}); return this.snapshot(); }
  handoffUnconfirmed() { clearTimeout(this.handoffTimer); this.adapter?.recover?.(); this.set({state:'error',error:'handoff_unconfirmed',requires_restart:true}); }
  dispose() { this.disposed = true; clearTimeout(this.handoffTimer); this.adapter?.cancel(); this.adapter?.dispose(); }
}
module.exports = { UpdateController, newerStable, deadline };
