'use strict';
// Runs in an isolated renderer world. No Node, preload, app binding or IPC.
// Cancel same-document transitions before the History API changes the document.
// Reissue as a document navigation, which the main-process policy cancels and
// hands to the default browser. There is no URL-only replaceState recovery.
function installNavigationScope(enabled, hosts, purpose, authPattern) {
  const key = '__vxchatNavigationScope';
  if (globalThis[key]) globalThis[key]();
  delete globalThis[key];
  if (!enabled || !globalThis.navigation) return !!globalThis.navigation;
  const authPath = new RegExp(authPattern,'i');
  const outside = value => {
    try {
      const u = new URL(value, location.href);
      return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password &&
        !(u.protocol === 'https:' && !u.port && hosts.includes(u.hostname) &&
          (/^\/messages(?:\/|$)/.test(u.pathname) || (purpose === 'call' && /^\/(?:groupcall|call|calls|videocall)(?:\/|$)/i.test(u.pathname)) || authPath.test(u.pathname)));
    } catch { return false; }
  };
  let pending = null;
  const dispatch = value => {
    // Collapse only the same synchronous navigation attempt, not later clicks.
    if (pending === value) return;
    pending = value;
    queueMicrotask(() => { if (pending === value) { pending = null; location.assign(value); } });
  };
  const navigate = event => {
    if (!event.destination.sameDocument || !event.cancelable || !outside(event.destination.url)) return;
    event.preventDefault(); dispatch(event.destination.url);
  };
  const click = event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.composedPath().find(n => n?.tagName === 'A' && n.href);
    if (!anchor || anchor.download || !outside(anchor.href)) return;
    event.preventDefault(); event.stopImmediatePropagation(); dispatch(anchor.href);
  };
  navigation.addEventListener('navigate', navigate);
  document.addEventListener('click', click, true);
  globalThis[key] = () => { pending = null; navigation.removeEventListener('navigate', navigate); document.removeEventListener('click', click, true); };
  return true;
}
module.exports = { installNavigationScope };
