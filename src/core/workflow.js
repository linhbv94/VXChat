'use strict';
const { navigationKind, httpsURL, externalWebURL, ownedBlobURL } = require('./services');
const { serviceScopeDecision, AUTH_PATH } = require('./service_scope');
function routeStage(serviceID, value) {
  const url = httpsURL(value);
  if (!url) return value === 'about:blank' ? 'blank' : 'unknown';
  const kind = navigationKind(serviceID, value);
  if (kind === 'auth' || (kind === 'service' && AUTH_PATH.test(url.pathname))) return 'auth';
  if (kind !== 'service') return 'external';
  if (serviceID === 'zalo') return url.hostname === 'chat.zalo.me' && !url.port ? 'client' : 'service';
  if (serviceID === 'slack') return url.hostname === 'app.slack.com' && /^\/client\/[A-Za-z0-9]+(?:\/|$)/.test(url.pathname) ? 'client' : 'auth';
  if (serviceID === 'messenger') return /^\/messages(?:\/|$)/.test(url.pathname) ? 'client' : 'setup';
  if (serviceID === 'chatgpt' && /^\/(?:c|g)\//.test(url.pathname)) return 'client';
  return 'service';
}
function navigationDecision(serviceID, value, { auxiliary = false, currentURL = '', initiator = '', phase = 'starting', redirected = false, setupConfirmed = true, purpose = 'primary', authFlow = false } = {}) {
  if (value === 'about:blank' && auxiliary) return 'allow';
  if (ownedBlobURL(value, currentURL) || (auxiliary && ownedBlobURL(value, initiator))) return 'allow';
  if (httpsURL(value) && navigationKind(serviceID, value) === 'auth') return 'allow';
  const scoped = serviceScopeDecision(serviceID, value, { confirmed: setupConfirmed, purpose, authFlow: authFlow || (phase === 'authenticating' && routeStage(serviceID, currentURL) === 'auth') });
  if (scoped) return scoped;
  const url = httpsURL(value);
  if (!url) return externalWebURL(value)?.protocol === 'http:' && !auxiliary && ['browsing', 'client_ready'].includes(phase) ? 'external' : 'block';
  if (auxiliary) return 'allow'; // No preload/IPC; permissions remain origin-scoped.
  const kind = navigationKind(serviceID, value);
  if (kind === 'auth') return 'allow';
  if (kind === 'service') {
    const stage = routeStage(serviceID, value);
    if (serviceID === 'messenger' && stage === 'setup' && setupConfirmed && phase === 'client_ready' && routeStage(serviceID, currentURL) !== 'auth') return 'external';
    return 'allow';
  }
  // Login redirects may use a company's IdP. They stay isolated in the same
  // content owner; this grants no service IPC, cookies from another partition,
  // native permission or permanent trust to that origin.
  if (['starting', 'authenticating', 'post_login_setup'].includes(phase) || routeStage(serviceID, currentURL) === 'auth') return 'allow';
  return redirected ? 'recover' : 'external';
}
function canHandoff(serviceID, value, primaryURL) {
  if (routeStage(serviceID, value) !== 'client') return false;
  if (serviceID === 'slack') return /^\/client\/T[A-Z0-9]*(?:\/[CGD][A-Z0-9]*)?\/?$/.test(httpsURL(value).pathname);
  if (serviceID === 'zalo') return routeStage(serviceID, primaryURL) === 'auth';
  return serviceID === 'messenger' && ['auth', 'setup'].includes(routeStage(serviceID, primaryURL));
}
class Workflow {
  constructor(serviceID) { this.serviceID = serviceID; this.phase = 'starting'; this.origin = null; this.trace = []; }
  committed(value, role = 'primary') {
    const stage = routeStage(this.serviceID, value);
    const url = httpsURL(value);
    if (role === 'primary') {
      this.origin = url?.origin || null;
      this.phase = stage === 'auth' || (stage === 'external' && ['starting', 'authenticating', 'post_login_setup'].includes(this.phase)) ? 'authenticating' : stage === 'setup' ? 'post_login_setup' : stage === 'client' ? 'client_ready' : 'browsing';
    }
    this.trace.push({ role, stage, origin: url?.origin || null });
    if (this.trace.length > 32) this.trace.shift();
    return stage;
  }
  snapshot() { return { phase: this.phase, origin: this.origin }; }
}
module.exports = { routeStage, navigationDecision, canHandoff, Workflow };
