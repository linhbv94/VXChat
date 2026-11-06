'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { httpsURL } = require('../core/services');
const { installMessengerLayout } = require('../adapters/messenger_layout');
const CSS = fs.readFileSync(path.join(__dirname, '../adapters/messenger_nav.css'), 'utf8');
function compactAllowed(url, confirmed) {
  const u = httpsURL(url);
  return !!confirmed && !!u && !u.port && ['www.facebook.com', 'facebook.com', 'www.messenger.com', 'messenger.com'].includes(u.hostname) && /^\/messages(?:\/|$)/.test(u.pathname);
}
class MessengerPresentation {
  constructor(contents, live) { this.contents = contents; this.live = live; this.key = null; this.enabled = false; this.revision = 0; this.pending = null; }
  async sync(enabled) {
    if (!this.live() || this.contents.isDestroyed()) return;
    if (this.enabled === enabled && (this.key || !enabled)) return;
    const revision = ++this.revision; this.enabled = enabled;
    const old = this.key; this.key = null;
    if (old) { try { await this.contents.removeInsertedCSS(old); } catch {} }
    if (this.contents.executeJavaScriptInIsolatedWorld && this.live() && revision === this.revision) await this.contents.executeJavaScriptInIsolatedWorld(1024, [{ code: `(${installMessengerLayout.toString()})(${JSON.stringify(enabled)})` }]);
    if (!enabled || !this.live() || revision !== this.revision) return;
    const key = await this.contents.insertCSS(CSS);
    if (!this.live() || revision !== this.revision || !this.enabled) { try { await this.contents.removeInsertedCSS(key); } catch {} return; }
    this.key = key;
  }
  navigated() { ++this.revision; this.enabled = false; this.key = null; }
  dispose() { ++this.revision; this.enabled = false; const key = this.key; this.key = null; if (key && !this.contents.isDestroyed()) void this.contents.removeInsertedCSS(key).catch(() => {}); }
}
module.exports = { MessengerPresentation, compactAllowed };
