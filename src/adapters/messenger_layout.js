'use strict';
function installMessengerLayout(enabled) {
  const key = '__vxchatMessengerLayout';
  globalThis[key]?.(); delete globalThis[key];
  // Remove the obsolete fixed-frame markers; React retains layout ownership.
  document.querySelectorAll('[data-vx-messenger-frame], [data-vx-messenger-shell]').forEach(node => {
    node.removeAttribute('data-vx-messenger-frame'); node.removeAttribute('data-vx-messenger-shell');
  });
  const clear = () => document.documentElement.removeAttribute('data-vx-messenger-clean');
  if (!enabled || !/^\/messages(?:\/|$)/.test(location.pathname)) { clear(); return; }
  document.documentElement.setAttribute('data-vx-messenger-clean', '');
  // Variable-only layout adjustment: no geometry guesses or subtree observer.
  globalThis[key] = clear;
}
module.exports = { installMessengerLayout };
