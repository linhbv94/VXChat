/* Discover structural containers instead of depending on generated Comet classes. */
(function () {
    'use strict';
    if (window.__vxMessengerLayout) { window.__vxMessengerLayout(); return; }
    var queued = false;
    var frameRequest = 0;
    var fallbackTimer = 0;
    function update() {
        if (!queued) return;
        queued = false;
        cancelAnimationFrame(frameRequest);
        clearTimeout(fallbackTimer);
        var clean = /^\/messages(?:\/|$)/.test(location.pathname) && !!document.getElementById('vx_clean_header_style');
        document.documentElement.toggleAttribute('data-vx-messenger-clean', clean);
        if (clean) {
            document.querySelectorAll('[role="main"]').forEach(function (main) {
                var shell = main.parentElement;
                // Only promote the common shell containing both the thread list and main.
                if (!shell || !shell.querySelector('[role="navigation"] a[href*="/messages/"]')) return;
                shell.setAttribute('data-vx-messenger-shell', '');
                if (shell.parentElement && shell.parentElement !== document.body) {
                    shell.parentElement.setAttribute('data-vx-messenger-frame', '');
                }
            });
            if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
        }
        document.querySelectorAll('[role="main"] [role="log"]').forEach(function (log) {
            [log].concat(Array.from(log.querySelectorAll('div'))).forEach(function (node) {
                var scrolls = /^(auto|scroll)$/.test(getComputedStyle(node).overflowY);
                if (scrolls && !node.hasAttribute('data-vx-message-scroll')) node.setAttribute('data-vx-message-scroll', '');
                if (!scrolls && node.hasAttribute('data-vx-message-scroll')) node.removeAttribute('data-vx-message-scroll');
            });
        });
    }
    function schedule() {
        if (!queued) {
            queued = true;
            frameRequest = requestAnimationFrame(update);
            fallbackTimer = setTimeout(update, 120); // Hidden WKWebViews may suspend animation frames.
        }
    }
    window.__vxMessengerLayout = schedule;
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    addEventListener('resize', schedule);
    addEventListener('popstate', schedule);
    addEventListener('vx_route_changed', schedule);
    addEventListener('scroll', function () {
        if (document.documentElement.hasAttribute('data-vx-messenger-clean') && (scrollX || scrollY)) window.scrollTo(0, 0);
    }, { passive: true });
    schedule();
})();
