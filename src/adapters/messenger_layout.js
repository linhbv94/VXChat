'use strict';
function installMessengerLayout(enabled) {
  const key = '__vxchatMessengerLayout';
  globalThis[key]?.(); delete globalThis[key];
  const clear = () => document.querySelectorAll('[data-vx-messenger-frame], [data-vx-messenger-shell]').forEach(n => { n.removeAttribute('data-vx-messenger-frame'); n.removeAttribute('data-vx-messenger-shell'); });
  if (!enabled) { clear(); return; }
  let timer = null; let disposed = false;
  const update = () => {
    timer = null;
    if (disposed) return;
    if (!/^\/messages(?:\/|$)/.test(location.pathname)) { clear(); return; }
    for (const main of document.querySelectorAll('[role="main"]')) {
      let shell = main;
      // Find the common chat shell, not a thread/composer/scroll subtree.
      while (shell && shell !== document.body && !shell.querySelector('[role="navigation"] a[href*="/messages/"]')) shell = shell.parentElement;
      if (!shell || shell === document.body) continue;
      let frame = null;
      for (let node = shell; node && node !== document.body; node = node.parentElement) {
        if (node.querySelector('[role="banner"], [data-pagelet="TopNav"]')) break;
        const r = node.getBoundingClientRect();
        if (r.width >= innerWidth * 0.75 && r.top >= 20 && r.top <= 120 && Math.abs(r.bottom - innerHeight) <= 12) frame = node;
      }
      if (frame) { frame.setAttribute('data-vx-messenger-frame', ''); shell.setAttribute('data-vx-messenger-shell', ''); }
    }
  };
  const schedule = () => { if (!disposed && timer === null) timer = setTimeout(update, 50); };
  // Child-list observation only: our own attribute markers cannot cause loops.
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', schedule); update();
  globalThis[key] = () => { disposed = true; clearTimeout(timer); observer.disconnect(); removeEventListener('resize', schedule); clear(); };
}
module.exports = { installMessengerLayout };
