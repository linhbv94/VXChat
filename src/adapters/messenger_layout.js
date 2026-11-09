'use strict';
function installMessengerLayout(enabled) {
  const key = '__vxchatMessengerLayout';
  globalThis[key]?.(); delete globalThis[key];
  // Remove the obsolete fixed-frame markers; React retains layout ownership.
  document.querySelectorAll('[data-vx-messenger-frame], [data-vx-messenger-shell]').forEach(node => {
    node.removeAttribute('data-vx-messenger-frame'); node.removeAttribute('data-vx-messenger-shell');
  });
  const clear = () => {
    document.documentElement.removeAttribute('data-vx-messenger-clean');
    document.documentElement.removeAttribute('data-vx-messenger-media');
  };
  if (!enabled) { clear(); return; }
  const syncRoute = (url = location.href) => {
    let pathname = location.pathname;
    try { pathname = new URL(url, location.href).pathname; } catch {}
    if (!/^\/(?:messages|messenger_media)(?:\/|$)/.test(pathname)) { clear(); return; }
    document.documentElement.setAttribute('data-vx-messenger-clean', '');
    if (/^\/messenger_media(?:\/|$)/.test(pathname)) document.documentElement.setAttribute('data-vx-messenger-media', '');
    else document.documentElement.removeAttribute('data-vx-messenger-media');
  };
  syncRoute();
  const onNavigate = event => { if (event?.destination?.sameDocument) syncRoute(event.destination.url); };
  const onPopState = () => syncRoute();
  globalThis.navigation?.addEventListener('navigate', onNavigate);
  globalThis.addEventListener('popstate', onPopState);
  // Variable-only layout adjustment: no geometry guesses or subtree observer.
  globalThis[key] = () => {
    globalThis.navigation?.removeEventListener('navigate', onNavigate);
    globalThis.removeEventListener('popstate', onPopState);
    clear();
  };
}
module.exports = { installMessengerLayout };
