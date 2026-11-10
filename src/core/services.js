'use strict';

const SERVICES = Object.freeze({
  messenger: Object.freeze({ label: 'Messenger', url: 'https://www.facebook.com/messages/t', hosts: ['facebook.com', 'messenger.com'], multiTab: false }),
  zalo: Object.freeze({ label: 'Zalo', url: 'https://chat.zalo.me/', hosts: ['zalo.me'], multiTab: false }),
  slack: Object.freeze({ label: 'Slack', url: 'https://app.slack.com/', hosts: ['slack.com'], multiTab: false }),
  chatgpt: Object.freeze({ label: 'ChatGPT', url: 'https://chatgpt.com/', hosts: ['chatgpt.com'], multiTab: true }),
  gmail: Object.freeze({ label: 'Gmail', url: 'https://mail.google.com/', hosts: ['mail.google.com', 'meet.google.com'], multiTab: false, partition: 'persist:service-google' }),
  gemini: Object.freeze({ label: 'Gemini', url: 'https://gemini.google.com/app', hosts: ['gemini.google.com', 'meet.google.com'], multiTab: true, partition: 'persist:service-google' }),
  meet: Object.freeze({ label: 'Meet', url: 'https://meet.google.com/', hosts: ['meet.google.com'], multiTab: false, partition: 'persist:service-google' }),
  telegram: Object.freeze({ label: 'Telegram', url: 'https://web.telegram.org/', hosts: ['telegram.org', 'web.telegram.org', 't.me'], multiTab: false }),
  whatsapp: Object.freeze({ label: 'WhatsApp', url: 'https://web.whatsapp.com/', hosts: ['whatsapp.com', 'web.whatsapp.com', 'whatsapp.net'], multiTab: false }),
  discord: Object.freeze({ label: 'Discord', url: 'https://discord.com/channels/@me', hosts: ['discord.com', 'discordapp.com', 'discordapp.net', 'discord.gg'], multiTab: false })
});
const AUTH_HOSTS = Object.freeze(['accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com', 'auth.openai.com', 'auth0.openai.com', 'id.zalo.me']);

const CUSTOM_SERVICES = new Map();

function registerCustomService(record) {
  if (!record || typeof record !== 'object') throw new Error('invalid_custom_service');
  const { id, label, service_url, login_url, icon_key, created_at } = record;
  const serviceU = externalWebURL(service_url);
  if (!serviceU) throw new Error('invalid_custom_service');
  const loginU = login_url ? externalWebURL(login_url) : serviceU;
  if (!loginU) throw new Error('invalid_custom_service');
  const hosts = Array.from(new Set([serviceU.hostname, loginU.hostname]));
  const def = Object.freeze({
    id,
    label: (label || '').trim(),
    url: serviceU.href,
    login_url: loginU.href,
    origin: serviceU.origin,
    icon_key: icon_key || 'zchat',
    hosts,
    multiTab: false,
    is_custom: true,
    created_at: created_at || Date.now(),
    partition: `persist:service-${id}`
  });
  CUSTOM_SERVICES.set(id, def);
  return def;
}

function unregisterCustomService(id) {
  CUSTOM_SERVICES.delete(id);
}

function clearCustomServices() {
  CUSTOM_SERVICES.clear();
}

function customServicesList() {
  return Array.from(CUSTOM_SERVICES.values());
}

function service(id) {
  if (Object.hasOwn(SERVICES, id)) return SERVICES[id];
  if (CUSTOM_SERVICES.has(id)) return CUSTOM_SERVICES.get(id);
  throw new Error('service_not_enabled');
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
  const definition = service(serviceID);
  if (definition.is_custom) {
    const u = externalWebURL(value);
    if (!u) return 'blocked';
    const serviceOrigin = new URL(definition.url).origin;
    const loginOrigin = definition.login_url ? new URL(definition.login_url).origin : serviceOrigin;
    if (u.origin === serviceOrigin || u.origin === loginOrigin) return 'service';
    if (AUTH_HOSTS.includes(u.hostname)) return 'auth';
    return 'external';
  }
  const u = httpsURL(value);
  if (!u) return 'blocked';
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
  let isCustom = false;
  try { isCustom = !!service(serviceID)?.is_custom; } catch {}
  if (isCustom) {
    const kind = navigationKind(serviceID, value);
    if (kind === 'service' || kind === 'auth') return 'owned';
    if (kind === 'external') return 'external';
    return 'blocked';
  }
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

module.exports = {
  externalWebURL,
  slackClientURL,
  SERVICES,
  AUTH_HOSTS,
  service,
  defaultInstances,
  httpsURL,
  hostMatches,
  navigationKind,
  browserUserAgent,
  popupDisposition,
  ownedBlobURL,
  normalizeSlackWorkspace,
  registerCustomService,
  unregisterCustomService,
  clearCustomServices,
  customServicesList
};
