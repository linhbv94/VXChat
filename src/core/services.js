'use strict';

const SERVICES = Object.freeze({
  messenger: Object.freeze({ label: 'Messenger', url: 'https://www.facebook.com/messages/t', hosts: ['facebook.com', 'messenger.com'], multiTab: false }),
  zalo: Object.freeze({ label: 'Zalo', url: 'https://chat.zalo.me/', hosts: ['zalo.me'], multiTab: false }),
  slack: Object.freeze({ label: 'Slack', url: 'https://app.slack.com/', hosts: ['slack.com'], multiTab: false }),
  chatgpt: Object.freeze({ label: 'ChatGPT', url: 'https://chatgpt.com/', hosts: ['chatgpt.com'], multiTab: true }),
  gmail: Object.freeze({ label: 'Gmail', url: 'https://mail.google.com/', hosts: ['mail.google.com', 'meet.google.com'], multiTab: false, partition: 'persist:service-google' }),
  gemini: Object.freeze({ label: 'Gemini', url: 'https://gemini.google.com/app', hosts: ['gemini.google.com', 'meet.google.com'], multiTab: true, partition: 'persist:service-google' }),
  meet: Object.freeze({ label: 'Meet', url: 'https://meet.google.com/', hosts: ['meet.google.com'], multiTab: false, partition: 'persist:service-google' })
});
const AUTH_HOSTS = Object.freeze(['accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com', 'auth.openai.com', 'auth0.openai.com', 'id.zalo.me']);

function service(id) {
  if (!Object.hasOwn(SERVICES, id)) throw new Error('service_not_enabled');
  return SERVICES[id];
}
function defaultInstances() {
  return Object.keys(SERVICES).map(id => ({ id: `default_${id}`, service_id: id, label: service(id).label, partition: service(id).partition || `persist:service-${id}` }));
}
function httpsURL(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password ? u : null;
  } catch { return null; }
}
function externalWebURL(value) {
  try { const u = new URL(value); return typeof value === 'string' && value.length <= 8192 && ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u : null; } catch { return null; }
}

function hostMatches(host, domain) { return host === domain || host.endsWith(`.${domain}`); }
function navigationKind(serviceID, value) {
  const u = httpsURL(value);
  if (!u) return 'blocked';
  const definition = service(serviceID);
  // Identity is a sibling of the client; classify before the zalo.me match.
  if (serviceID === 'zalo' && u.hostname === 'id.zalo.me' && !u.port) return 'auth';
  if (definition.hosts.some(h => hostMatches(u.hostname, h))) return 'service';
  if (AUTH_HOSTS.includes(u.hostname)) return 'auth';
  return 'external';
}
// Preserve the runtime's real platform and Chromium version; never invent Chrome 145.
function browserUserAgent(original) {
  return original.replace(/\s(?:Electron|VXChat|vxchat)\/[^\s]+/g, '');
}
function popupDisposition(serviceID, value, { phase = 'browsing', currentURL = '', auxiliary = false } = {}) {
  if (value === 'about:blank') return 'owned';
  if (ownedBlobURL(value, currentURL)) return 'owned';
  if (externalWebURL(value)?.protocol === 'http:') return ['browsing', 'client_ready'].includes(phase) ? 'external' : 'blocked';
  const kind = navigationKind(serviceID, value);
  if (kind === 'blocked') return kind;
  if (kind === 'external') return auxiliary || ['starting', 'authenticating', 'post_login_setup'].includes(phase) ? 'owned' : 'external';
  return 'owned';
}
function ownedBlobURL(value, initiator) {
  try {
    const blob = new URL(value); const source = new URL(initiator);
    const origin = httpsURL(source.protocol === 'blob:' ? source.origin : source.href);
    return blob.protocol === 'blob:' && !!origin && blob.origin === origin.origin;
  } catch { return false; }
}
function normalizeSlackWorkspace(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value !== 'string' || value.length > 2048) throw new Error('invalid_workspace_url');
  const input = value.trim();
  const url = httpsURL(input.includes('://') ? input : `https://${input}`);
  if (!url || url.search || url.hash || url.port) throw new Error('invalid_workspace_url');
  if (url.hostname === 'app.slack.com') {
    if (url.pathname === '/') return null;
    const match = /^\/client\/(T[A-Z0-9]+)(?:\/[A-Z0-9]+)*\/?$/i.exec(url.pathname);
    if (!match) throw new Error('invalid_workspace_url');
    return `https://app.slack.com/client/${match[1].toUpperCase()}`;
  }
  const tenant = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.slack\.com$/.exec(url.hostname);
  if (!tenant || ['app', 'api', 'auth', 'login', 'files', 'status'].includes(tenant[1]) || url.pathname !== '/') throw new Error('invalid_workspace_url');
  return `https://${url.hostname}/`;
}

// Convert only the documented workspace/channel deep links to the existing web client.
// No OS protocol handler, token forwarding or generic custom-scheme fallback.
function slackClientURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'slack:' || url.username || url.password || url.port || url.hash || !['', '/'].includes(url.pathname) || !['open', 'channel'].includes(url.hostname)) return null;
    const keys = [...url.searchParams.keys()];
    if (new Set(keys).size !== keys.length || keys.some(k => !['team', 'id'].includes(k))) return null;
    const team = url.searchParams.get('team'); const channel = url.searchParams.get('id');
    if (!/^T[A-Z0-9]+$/.test(team || '')) return null;
    if (url.hostname === 'channel' && !/^[CGD][A-Z0-9]+$/.test(channel || '')) return null;
    if (url.hostname === 'open' && channel) return null;
    return `https://app.slack.com/client/${team}${channel ? `/${channel}` : ''}`;
  } catch { return null; }
}

module.exports = { externalWebURL, slackClientURL, SERVICES, AUTH_HOSTS, service, defaultInstances, httpsURL, hostMatches, navigationKind, browserUserAgent, popupDisposition, ownedBlobURL, normalizeSlackWorkspace };
