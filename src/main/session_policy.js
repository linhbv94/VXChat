'use strict';
const { service, httpsURL, hostMatches, browserUserAgent } = require('../core/services');
const { PermissionStore } = require('../core/permission_store');
const { text } = require('./messages');
function permissionKeys(permission, details, check = false) {
  if (permission !== 'media') return ['notifications', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'speaker-selection'].includes(permission) ? [permission] : [];
  const types = check ? [details.mediaType] : details.mediaTypes;
  if (!Array.isArray(types) || !types.length || types.some(type => !['audio', 'video'].includes(type))) return [];
  return [...new Set(types)].map(type => `media:${type}`);
}
class SessionPolicy {
  constructor({ session, dialog, window, resolveOwner, contentsFromFrame = () => null, selectDisplaySource = async () => null, permissionStore = new PermissionStore(), downloads = null, systemPreferences = null, getLanguage = () => 'vi' }) {
    Object.assign(this, { session, dialog, window, resolveOwner, contentsFromFrame, selectDisplaySource, permissionStore, downloads, systemPreferences, getLanguage });
    this.configured = new Map(); this.pending = new Map();
  }
  t(key) { return text(this.getLanguage(), key); }
  context(instance, wc, value, isMainFrame = true) {
    try {
      const owner = this.resolveOwner(wc); const url = httpsURL(value);
      if (owner?.permissionDeniedContents?.has(wc)) return null;
      const top = wc && !wc.isDestroyed?.() && httpsURL(wc.getURL());
      if (!owner || !owner.isLive(owner) || owner.instance.id !== instance.id || !isMainFrame || !url || !top || url.origin !== top.origin || !service(instance.service_id).hosts.some(h => hostMatches(url.hostname, h))) return null;
      return { owner, origin: url.origin };
    } catch { return null; }
  }
  async ensureOSMedia(keys) {
    if (process.platform !== 'darwin' || !this.systemPreferences) return true;
    for (const key of keys) {
      const device = key === 'media:audio' ? 'microphone' : key === 'media:video' ? 'camera' : null;
      if (!device) continue;
      const status = this.systemPreferences.getMediaAccessStatus(device);
      if (status === 'granted') continue;
      if (status !== 'not-determined' || !await this.systemPreferences.askForMediaAccess(device)) return false;
    }
    return true;
  }
  get(instance) {
    if (this.configured.has(instance.id)) return this.configured.get(instance.id);
    const ses = this.session.fromPartition(instance.partition); ses.setUserAgent(browserUserAgent(ses.getUserAgent()));
    const context = (wc, value, main) => this.context(instance, wc, value, main);
    ses.setPermissionCheckHandler((wc, permission, origin, details = {}) => {
      const ctx = context(wc, origin, details.isMainFrame !== false);
      if (!ctx) return false;
      if (permission === 'display-capture') return true; // Eligibility only; source choice is still required.
      const keys = permissionKeys(permission, details, true);
      return !!keys.length && keys.every(key => this.permissionStore.decision(instance.id, ctx.origin, key) === 'allow');
    });
    ses.setPermissionRequestHandler(async (wc, permission, callback, details = {}) => {
      let replied = false;
      const reply = allowed => { if (!replied) { replied = true; try { callback(allowed); } catch {} } };
      try {
        const ctx = context(wc, details.requestingUrl || wc?.getURL?.(), details.isMainFrame !== false);
        if (!ctx) { reply(false); return; }
        if (permission === 'display-capture') { reply(true); return; }
        const keys = permissionKeys(permission, details);
        if (!keys.length || keys.some(key => this.permissionStore.decision(instance.id, ctx.origin, key) === 'deny')) { reply(false); return; }
        let allowed = keys.every(key => this.permissionStore.decision(instance.id, ctx.origin, key) === 'allow');
        if (!allowed) {
          const promptKey = `${instance.id}|${ctx.origin}|${keys.slice().sort().join()}`;
          if (!this.pending.has(promptKey)) {
            const names = keys.map(key => this.t(key === 'media:audio' ? 'microphone' : key === 'media:video' ? 'camera' : key.startsWith('clipboard') ? 'clipboard' : key === 'speaker-selection' ? 'speaker' : key));
            const prompt = this.dialog.showMessageBox(this.window, { type: 'question', title: 'VXChat', message: `${ctx.origin}\n${names.join(', ')}`, detail: this.t('permission'), buttons: [this.t('deny'), this.t('allow')], defaultId: 0, cancelId: 0 });
            this.pending.set(promptKey, Promise.resolve(prompt).finally(() => this.pending.delete(promptKey)));
          }
          const result = await this.pending.get(promptKey);
          const current = context(wc, ctx.origin, details.isMainFrame !== false);
          if (!current || current.owner !== ctx.owner) { reply(false); return; }
          allowed = result.response === 1;
          this.permissionStore.set(instance.id, ctx.origin, keys, allowed ? 'allow' : 'deny');
        }
        if (allowed && permission === 'media') allowed = await this.ensureOSMedia(keys);
        const current = context(wc, ctx.origin, details.isMainFrame !== false);
        allowed = allowed && !!current && current.owner === ctx.owner;
        if (allowed && permission === 'media') ctx.owner.mediaGranted = true;
        reply(allowed);
      } catch { reply(false); }
    });
    ses.setDevicePermissionHandler(() => false);
    ses.setDisplayMediaRequestHandler(async (request, callback) => {
      let responded = false;
      const reply = streams => { if (!responded) { responded = true; try { callback(streams); } catch {} } };
      try {
        const wc = request.frame && this.contentsFromFrame(request.frame);
        const ctx = context(wc, request.securityOrigin, !!wc && request.frame === wc.mainFrame);
        if (!ctx || !request.userGesture || !request.videoRequested) { reply({}); return; }
        const source = await this.selectDisplaySource({ signal: ctx.owner.abort?.signal });
        const current = context(wc, request.securityOrigin, request.frame === wc.mainFrame);
        if (!source || !current || current.owner !== ctx.owner) { reply({}); return; }
        ctx.owner.mediaGranted = true; reply({ video: source }); // No implicit system audio.
      } catch { reply({}); }
    });
    ses.on('will-download', (event, item, wc) => {
      const owner = this.resolveOwner(wc);
      if (!owner || !owner.isLive(owner) || !this.downloads) { event.preventDefault(); return; }
      try { this.downloads.track(owner, item); } catch { event.preventDefault(); }
    });
    this.configured.set(instance.id, ses); return ses;
  }
}
module.exports = { SessionPolicy, permissionKeys };
