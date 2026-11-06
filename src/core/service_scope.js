'use strict';
const { httpsURL, externalWebURL } = require('./services');
const MESSENGER_HOSTS = ['facebook.com', 'www.facebook.com', 'messenger.com', 'www.messenger.com'];
const AUTH_PATH = /(?:^|\/)(?:login|signin|sign-in|auth|oauth|sso|checkpoint|recover|verify|authorize)(?:\.php)?(?:\/|$)/i;
function messengerRoute(value) {
  const url = httpsURL(value);
  if (!url || url.port || !MESSENGER_HOSTS.includes(url.hostname)) return 'outside';
  if (AUTH_PATH.test(url.pathname)) return 'auth';
  if (/^\/messages(?:\/|$)/.test(url.pathname)) return 'chat';
  if (/^\/(?:groupcall|call|calls|videocall)(?:\/|$)/i.test(url.pathname)) return 'call';
  return 'outside';
}
function serviceScopeDecision(serviceID, value, { confirmed = false, purpose = 'primary', authFlow = false } = {}) {
  if (serviceID !== 'messenger') return null;
  if (value === 'about:blank' && purpose !== 'primary') return 'allow';
  if (!externalWebURL(value)) return 'block';
  const route = messengerRoute(value);
  if (route === 'auth' || route === 'chat') return 'allow';
  if (!confirmed || authFlow) return null; // Existing isolated onboarding/IdP policy.
  if (purpose === 'call' && route === 'call') return 'allow';
  return 'external';
}
function windowPurpose(serviceID, value, authFlow = false) {
  if (authFlow) return 'auth';
  if (serviceID === 'messenger' && messengerRoute(value) === 'call') return 'call';
  return 'auxiliary';
}
module.exports = { AUTH_PATH, MESSENGER_HOSTS, messengerRoute, serviceScopeDecision, windowPurpose };
