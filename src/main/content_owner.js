'use strict';
const { randomUUID } = require('node:crypto');
const { service, httpsURL, popupDisposition, slackClientURL, externalWebURL, navigationKind } = require('../core/services');
const { Workflow, routeStage, navigationDecision, canHandoff } = require('../core/workflow');
const { text } = require('./messages');
const { ServiceState } = require('../core/service_state');
const { MessengerPresentation, compactAllowed } = require('./messenger_presentation');
const { AUTH_PATH, MESSENGER_HOSTS, messengerRoute, windowPurpose, serviceScopeDecision } = require('../core/service_scope');
const { installNavigationScope } = require('../adapters/navigation_scope');
const { installContextMenu } = require('./image_viewer');
function securePreferences(session) {
  return { session, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: false, webviewTag: false };
}
class ContentOwner {
  constructor({ tab, instance, generation, isLive, electron, window, sessionPolicy, register, unregister, changed = () => {}, getLanguage = () => 'vi', getStartURL = null, getZoom = () => 1, getChromeHeight = () => 68, serviceState = new ServiceState() }) {
    Object.assign(this, { tab, instance, generation, isLive, electron, window, register, unregister, changed, getLanguage, getStartURL, getZoom, getChromeHeight, serviceState });
    this.disposed = false; this.attached = false; this.popups = new Set(); this.popupContents = new Map(); this.popupRecords = new Map(); this.downloads = new Set();
    this.status = 'idle'; this.errorCode = null; this.issue = null; this.mediaGranted = false; this.cleanups = []; this.requestID = 0; this.handoffPending = false;
    this.workflow = new Workflow(instance.service_id); this.abort = new AbortController(); this.redirects = [];
    this.lastInScope = null; this.scopeRevisions = new WeakMap(); this.recoveringScope = false;
    this.imageViewers = new Set(); this.permissionDeniedContents = new Set();
    this.session = sessionPolicy.get(instance);
    this.view = new electron.WebContentsView({ webPreferences: securePreferences(this.session) });
    this.register(this.view.webContents, this); this.guard(this.view.webContents);
    const wc = this.view.webContents;
    this.presentation = instance.service_id === 'messenger' ? new MessengerPresentation(wc, () => this.live()) : null;
    this.listen(wc, 'did-start-loading', () => { this.errorCode = null; this.update('loading'); });
    this.listen(wc, 'did-stop-loading', () => { if (this.status !== 'error') this.update('ready'); });
    this.listen(wc, 'did-start-navigation', (_e, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) this.presentation?.navigated(); });
    this.listen(wc, 'did-finish-load', () => { this.committed(wc.getURL()); this.redirects = []; });
    this.listen(wc, 'did-navigate-in-page', (_event, url, mainFrame) => { if (mainFrame) this.committed(url, true); });
    this.listen(wc, 'did-fail-load', (_event, code, _description, _url, mainFrame) => { if (mainFrame && code !== -3) this.update('error', code); });
    this.listen(wc, 'render-process-gone', () => this.update('error', 'render_process_gone'));
  }
  t(key) { return text(this.getLanguage(), key); }
  live() { return !this.disposed && this.isLive(this); }
  listen(target, event, listener) {
    target.on(event, listener); const cleanup = () => target.removeListener(event, listener); this.cleanups.push(cleanup); return cleanup;
  }
  update(status, code = null) { if (this.live()) { this.status = status; this.errorCode = code; this.changed(); } }
  snapshot() {
    const url = this.view.webContents.getURL(); const confirmed = this.serviceState.entry(this.instance.id).setup_confirmed;
    const stage = routeStage(this.instance.service_id, url);
    return { location: httpsURL(url)?.hostname || null, setup: { confirmed, can_confirm: this.instance.service_id === 'messenger' && ['setup', 'client'].includes(stage) && this.status !== 'loading', compact: compactAllowed(url, confirmed) }, workflow: this.workflow.snapshot(), issue: this.issue, error_code: this.errorCode, popups: [...this.popupRecords.values()].map(({ id, stage, origin }) => ({ id, stage, origin })) };
  }
  startURL() { return this.serviceState.startURL(this.instance, this.getStartURL?.(this.instance.service_id)); }
  decision(url, record = null, redirected = false) {
    return navigationDecision(this.instance.service_id, url, { auxiliary: !!record, currentURL: record?.contents.getURL() || this.view.webContents.getURL(), initiator: record?.initiator, phase: this.workflow.phase, redirected, setupConfirmed: this.serviceState.entry(this.instance.id).setup_confirmed, purpose: record?.purpose || 'primary', authFlow: !!record?.authFlow });
  }
  committed(url, inPage = false) {
    if (!this.live()) return;
    if (this.decision(url) !== 'allow') {
      if (this.decision(url) === 'external') void this.openExternal(url);
      // Safety net for an early/uncancellable SPA transition: traverse to the
      // previous SAME document entry, without loading or copying draft text.
      const history = this.view.webContents.navigationHistory;
      const entries = history?.getAllEntries();
      const previous = this.lastInScope;
      const index = entries && entries.findIndex(e => e.url === previous?.url);
      if (inPage && previous && !this.recoveringScope && index >= 0 && history.getActiveIndex() !== index) {
        this.recoveringScope = true;
        history.goToIndex(index);
      } else { this.issue = 'navigation_blocked'; this.changed(); }
      return;
    }
    this.recoveringScope = false;
    this.applyZoom();
    this.workflow.committed(url);
    if (messengerRoute(url) === 'chat') this.lastInScope = { url };
    try { this.serviceState.observe(this.instance, url); } catch { this.issue = 'config_write_failed'; }
    this.updatePresentation(); this.changed();
  }
  updatePresentation() {
    if (!this.presentation) return;
    const enabled = compactAllowed(this.view.webContents.getURL(), this.serviceState.entry(this.instance.id).setup_confirmed);
    void this.presentation.sync(enabled).catch(() => { if (this.live()) { this.issue = 'presentation_failed'; this.changed(); } });
    this.syncScope(enabled);
  }
  applyZoom() { if (this.live() && !this.view.webContents.isDestroyed()) this.view.webContents.setZoomFactor?.(this.getZoom(this.instance.id)); }
  syncScope(enabled, wc = this.view.webContents, purpose = 'primary') {
    const revision = (this.scopeRevisions.get(wc) || 0) + 1; this.scopeRevisions.set(wc,revision);
    if (!wc.executeJavaScriptInIsolatedWorld) return; // Unit-test contents stub.
    void wc.executeJavaScriptInIsolatedWorld(1023, [{ code: `(${installNavigationScope.toString()})(${JSON.stringify(enabled)},${JSON.stringify(MESSENGER_HOSTS)},${JSON.stringify(purpose)},${JSON.stringify(AUTH_PATH.source)})` }]).then(available => {
      if (this.live() && revision === this.scopeRevisions.get(wc) && enabled && !available) { this.issue = 'navigation_blocked'; this.changed(); }
    }).catch(() => { if (this.live() && revision === this.scopeRevisions.get(wc)) { this.issue = 'navigation_blocked'; this.changed(); } });
  }
  async confirmSetup() {
    if (!this.live() || !this.snapshot().setup.can_confirm) throw new Error('invalid_setup');
    try { this.serviceState.confirm(this.instance); } catch { throw new Error('config_write_failed'); }
    this.updatePresentation(); this.changed();
    if (routeStage('messenger', this.view.webContents.getURL()) !== 'client') await this.navigateTo(service('messenger').url);
    if (this.live() && routeStage('messenger', this.view.webContents.getURL()) === 'client') for (const popup of this.popupRecords.values()) if (popup.authSeen && routeStage('messenger', popup.contents.getURL()) === 'client' && !popup.child.isDestroyed()) popup.child.close();
  }
  async reopenSetup() {
    if (!this.live() || this.instance.service_id !== 'messenger') throw new Error('invalid_setup');
    if (!await this.confirmClose()) return;
    try { this.serviceState.resetSetup(this.instance); } catch { throw new Error('config_write_failed'); }
    this.updatePresentation(); await this.navigateTo('https://www.facebook.com/');
  }
  async navigateTo(url) {
    if (!this.live()) return;
    const decision = this.decision(url);
    if (decision !== 'allow') { if (decision === 'external') await this.openExternal(url); else { this.issue = 'navigation_blocked'; this.changed(); } return; }
    const request = ++this.requestID; this.issue = null; this.redirects = [];
    try { await this.view.webContents.loadURL(url); }
    catch (error) { if (this.live() && request === this.requestID && error.code !== 'ERR_ABORTED' && error.errno !== -3) this.update('error', 'load_failed'); }
  }
  load() { void this.navigateTo(this.startURL()); }
  async home() { if (await this.confirmClose()) await this.navigateTo(this.startURL()); }
  reload() {
    if (!this.live()) return;
    if (!this.view.webContents.getURL()) { this.load(); return; }
    if (this.decision(this.view.webContents.getURL()) !== 'allow') { this.issue = 'navigation_blocked'; this.changed(); return; }
    ++this.requestID; this.issue = null; this.redirects = []; this.view.webContents.reload();
  }
  setSelected(selected) {
    if (this.disposed || this.window.isDestroyed()) return;
    if (selected) { if (!this.attached) { this.window.contentView.addChildView(this.view); this.attached = true; } this.resize(); }
    else if (this.attached) { this.window.contentView.removeChildView(this.view); this.attached = false; }
  }
  resize() {
    if (this.disposed || this.window.isDestroyed()) return;
    const { width, height } = this.window.getContentBounds(); const chrome = this.getChromeHeight();
    this.view.setBounds({ x: 0, y: chrome, width, height: Math.max(0, height - chrome) });
  }
  guard(wc, record = null) {
    installContextMenu(this, wc);
    const auxiliary = !!record;
    const navigate = (event, url, redirected) => {
      if (!this.live() || wc.isDestroyed()) { event.preventDefault(); return; }
      const converted = this.instance.service_id === 'slack' && slackClientURL(url);
      if (converted) { event.preventDefault(); if (auxiliary) void wc.loadURL(converted).catch(() => { if (this.live()) { record.stage = 'error'; this.issue = 'handoff_failed'; this.changed(); } }); else void this.navigateTo(converted); return; }
      if (!auxiliary && !redirected) ++this.requestID;
      if (record && record.stage === 'waiting' && !record.authFlow && ['browsing', 'client_ready'].includes(record.openingPhase) && externalWebURL(url) && (navigationKind(this.instance.service_id, url) === 'external' || externalWebURL(url)?.protocol === 'http:') && routeStage(this.instance.service_id, url) !== 'auth') {
        event.preventDefault(); void this.openExternal(url).then(() => { if (this.live() && !record.child.isDestroyed()) record.child.close(); }); return;
      }
      if (record && routeStage(this.instance.service_id, url) === 'auth') { record.authFlow = true; record.authSeen = true; }
      if (record && !record.authFlow && record.stage === 'waiting' && windowPurpose(this.instance.service_id, url, false) === 'call') record.purpose = 'call';
      const decision = this.decision(url, record, redirected);
      if (decision === 'allow') {
        if (!auxiliary && routeStage(this.instance.service_id, url) === 'auth') {
          this.workflow.phase = 'authenticating';
          try { this.serviceState.observe(this.instance, url); } catch { this.issue = 'config_write_failed'; }
          this.updatePresentation(); this.changed();
        }
        if (redirected) {
          const now = Date.now(); const owner = record || this;
          owner.redirects = (owner.redirects || []).filter(t => now - t < 15000); owner.redirects.push(now);
          if (owner.redirects.length > 30) { event.preventDefault(); this.issue = 'redirect_loop'; if (record) record.stage = 'error'; this.changed(); }
        }
        return;
      }
      event.preventDefault();
      if (decision === 'external') void this.openExternal(url).then(() => { if (record && !record.authFlow && record.stage === 'waiting' && record.purpose !== 'call' && this.live() && !record.child.isDestroyed()) record.child.close(); });
      else { this.issue = 'navigation_blocked'; if (record) record.stage = 'error'; this.changed(); }
    };
    const unsubscribers = [
      this.listen(wc, 'will-navigate', (event, url) => navigate(event, url, false)),
      this.listen(wc, 'will-redirect', (event, url) => navigate(event, url, true)),
      this.listen(wc, 'will-attach-webview', event => event.preventDefault())
    ];
    wc.setWindowOpenHandler(({ url }) => {
      const converted = this.instance.service_id === 'slack' && slackClientURL(url);
      if (converted && this.live()) { void this.navigateTo(converted); return { action: 'deny' }; }
      const parsed = httpsURL(url);
      if (this.instance.service_id === 'messenger' && !auxiliary && this.serviceState.entry(this.instance.id).setup_confirmed && parsed && !parsed.port && MESSENGER_HOSTS.includes(parsed.hostname) && /^\/messenger_media(?:\/|$)/.test(parsed.pathname)) {
        if (this.live()) void this.navigateTo(url);
        return { action: 'deny' };
      }
      const authFlow = !!record?.authFlow || ['starting', 'authenticating', 'post_login_setup'].includes(this.workflow.phase);
      const purpose = windowPurpose(this.instance.service_id, url, authFlow);
      const scoped = navigationKind(this.instance.service_id, url) === 'auth' ? 'allow' : serviceScopeDecision(this.instance.service_id, url, { confirmed: this.serviceState.entry(this.instance.id).setup_confirmed, purpose, authFlow });
      const decision = scoped === 'external' ? 'external' : scoped === 'block' ? 'deny' : popupDisposition(this.instance.service_id, url, { auxiliary, currentURL: wc.getURL(), phase: this.workflow.phase });
      if (!this.live() || decision !== 'owned') {
        if (this.live() && decision === 'external') void this.openExternal(url);
        else if (this.live()) { this.issue = 'popup_blocked'; this.changed(); }
        return { action: 'deny' };
      }
      // Logical ownership is in popupRecords. A native parent on macOS pins
      // every child above main, preventing chat while a call stays open.
      return { action: 'allow', overrideBrowserWindowOptions: { modal: false, alwaysOnTop: false, webPreferences: securePreferences(this.session) } };
    });
    unsubscribers.push(this.listen(wc, 'did-create-window', (child, details = {}) => {
      if (!this.live()) { child.destroy(); return; }
      const childContents = child.webContents;
      const popup = { id: randomUUID(), child, contents: childContents, stage: (!details.url || details.url === 'about:blank') ? 'waiting' : 'opening', openingPhase: this.workflow.phase, authSeen: routeStage(this.instance.service_id, details.url) === 'auth', authFlow: ['starting', 'authenticating', 'post_login_setup'].includes(this.workflow.phase) || routeStage(this.instance.service_id, details.url) === 'auth', origin: httpsURL(details.url)?.origin || null, initiator: wc.getURL(), timer: null, cleanups: [] };
      popup.purpose = windowPurpose(this.instance.service_id, details.url, popup.authFlow);
      this.popups.add(child); this.popupContents.set(child, childContents); this.popupRecords.set(popup.id, popup); this.register(childContents, this);
      popup.cleanups = this.guard(childContents, popup);
      const committed = (inPage = false) => {
        if (!this.live() || child.isDestroyed()) return;
        const url = childContents.getURL(); popup.origin = httpsURL(url)?.origin || null;
        if (!popup.authFlow && popup.purpose === 'auxiliary' && windowPurpose(this.instance.service_id, url, false) === 'call') popup.purpose = 'call';
        if (this.decision(url, popup) !== 'allow') {
          if (this.decision(url,popup) === 'external') void this.openExternal(url);
          const history = childContents.navigationHistory; const index = history?.getAllEntries().findIndex(e => e.url === popup.lastInScope);
          if (inPage && index >= 0 && history.getActiveIndex() !== index) history.goToIndex(index);
          else if (popup.stage === 'waiting' && !popup.authFlow && popup.purpose !== 'call') child.close();
          else {this.issue = 'navigation_blocked'; this.changed();} return;
        }
        popup.lastInScope = url;
        const stage = this.workflow.committed(url, 'popup'); if (stage === 'auth') { popup.authFlow = true; popup.authSeen = true; } popup.stage = stage === 'blank' || !url ? 'waiting' : stage === 'auth' ? 'authenticating' : 'open';
        if (popup.timer && url && url !== 'about:blank') { clearTimeout(popup.timer); popup.timer = null; }
        this.changed();
        if (this.instance.service_id === 'messenger') this.syncScope(this.serviceState.entry(this.instance.id).setup_confirmed && !popup.authFlow,childContents,popup.purpose);
        if ((this.instance.service_id !== 'messenger' || this.serviceState.entry(this.instance.id).setup_confirmed) && (this.instance.service_id !== 'zalo' || popup.authSeen) && canHandoff(this.instance.service_id, url, this.view.webContents.getURL())) void this.handoff(popup, url);
      };
      popup.cleanups.push(this.listen(childContents, 'did-finish-load', () => committed(false)));
      popup.cleanups.push(this.listen(childContents, 'did-navigate-in-page', (_e, _url, mainFrame) => { if (mainFrame) committed(true); }));
      popup.cleanups.push(this.listen(childContents, 'did-fail-load', (_e, code, _d, _u, mainFrame) => { if (mainFrame && code !== -3 && this.live()) { popup.stage = 'error'; this.issue = 'popup_failed'; this.changed(); } }));
      popup.timer = setTimeout(() => { if (this.live() && (!childContents.getURL() || childContents.getURL() === 'about:blank')) { popup.stage = 'waiting'; this.changed(); } }, 12000);
      popup.timer.unref?.();
      const closed = () => this.removePopup(popup);
      child.once('closed', closed); popup.closedListener = closed;
      this.changed();
    }));
    return unsubscribers;
  }
  async handoff(popup, url) {
    if (!this.live() || this.handoffPending || popup.child.isDestroyed()) return;
    this.handoffPending = true; const request = ++this.requestID; popup.stage = 'finishing'; this.changed();
    try {
      const primary = this.view.webContents;
      if (this.decision(url) !== 'allow') throw new Error('navigation_blocked');
      if (primary.getURL() !== url) await primary.loadURL(url);
      if (!this.live() || request !== this.requestID || popup.child.isDestroyed()) return;
      this.issue = null; this.committed(primary.getURL());
      if (!popup.child.isDestroyed()) popup.child.close();
    } catch (error) { if (this.live() && error.code !== 'ERR_ABORTED') { popup.stage = 'error'; this.issue = 'handoff_failed'; this.changed(); } }
    finally { this.handoffPending = false; if (this.live() && this.popupRecords.has(popup.id) && popup.stage === 'finishing') { popup.stage = 'open'; this.changed(); } }
  }
  removePopup(popup) {
    if (popup.timer) clearTimeout(popup.timer);
    for (const cleanup of popup.cleanups.splice(0)) { cleanup(); const index = this.cleanups.indexOf(cleanup); if (index >= 0) this.cleanups.splice(index, 1); }
    this.unregister(popup.contents); this.popups.delete(popup.child); this.popupContents.delete(popup.child); this.popupRecords.delete(popup.id);
    if (this.live()) this.changed();
  }
  focusPopup(id) { const p = this.popupRecords.get(id); if (!p || p.child.isDestroyed()) throw new Error('popup_not_found'); p.child.show(); p.child.focus(); }
  closePopup(id) { const p = this.popupRecords.get(id); if (!p || p.child.isDestroyed()) throw new Error('popup_not_found'); p.child.close(); }
  async openExternal(url) {
    const target = externalWebURL(url);
    if (!this.live() || !target) return;
    try { await this.electron.shell.openExternal(target.href); }
    catch { if (this.live()) { this.issue = 'external_open_failed'; this.changed(); } }
  }
  async confirmClose() {
    if (!this.live()) return false;
    if (!this.downloads.size && !this.popups.size && !this.mediaGranted && !this.view.webContents.isCurrentlyAudible()) return true;
    const { response } = await this.electron.dialog.showMessageBox(this.window, { title: 'VXChat', message: this.tab.label, detail: this.t('closeBusy'), buttons: [this.t('cancel'), this.t('closeTab')], defaultId: 0, cancelId: 0 });
    return response === 1 && this.live();
  }
  dispose() {
    if (this.disposed) return;
    this.presentation?.dispose(); this.disposed = true; ++this.requestID; this.abort.abort();
    if (this.attached && !this.window.isDestroyed()) this.window.contentView.removeChildView(this.view);
    this.attached = false;
    for (const item of this.downloads) { try { item.cancel(); } catch {} } this.downloads.clear();
    for (const popup of [...this.popupRecords.values()]) { this.removePopup(popup); if (!popup.child.isDestroyed()) popup.child.destroy(); }
    this.popups.clear(); this.popupContents.clear();
    for (const viewer of this.imageViewers) if (!viewer.isDestroyed()) viewer.destroy();
    this.imageViewers.clear(); this.permissionDeniedContents.clear();
    const wc = this.view.webContents; this.unregister(wc);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    if (!wc.isDestroyed()) wc.close({ waitForBeforeUnload: false });
  }
}
module.exports = { ContentOwner, securePreferences };
