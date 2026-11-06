/**
 * dom_observer.js — Client-side Navigation Guard, Hydration Baseline & Notification Observer
 * VXChat (macOS Native Web Wrapper)
 */
(function() {
    'use strict';

    if (window.__VX_OBSERVER_INJECTED) return;
    window.__VX_OBSERVER_INJECTED = true;

    // Helper: Safely post message to WebKit bridge
    function postBridge(handlerName, payload) {
        try {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers[handlerName]) {
                window.webkit.messageHandlers[handlerName].postMessage(payload);
            }
        } catch (e) {
            console.warn('[VXChat] postBridge error (' + handlerName + '):', e);
        }
    }

    // 2. Client-side SPA Navigation Interceptor (pushState / replaceState)
    function checkDisallowedFeed(path) {
        if (!path) return false;
        var p = path.split('?')[0].replace(/\/+$/, '') || '/';
        var disallowed = ['/', '/home.php', '/watch', '/marketplace', '/gaming', '/groups', '/reels'];
        return disallowed.indexOf(p) !== -1;
    }

    function onRouteChanged(path) {
        if (path) {
            var isDisallowed = checkDisallowedFeed(path);
            postBridge('messNavigationBridge', {
                event_type: 'SPA_ROUTE_CHANGED',
                target_path: path,
                is_disallowed_feed: isDisallowed,
                timestamp: Date.now()
            });
            if (isDisallowed) {
                window.location.replace('/messages/t');
            } else {
                window.dispatchEvent(new Event("vx_route_changed"));
            }
        }
    }

    var originalPushState = history.pushState;
    history.pushState = function(state, title, url) {
        originalPushState.apply(history, arguments);
        var path = typeof url === 'string' ? url : (url ? url.toString() : window.location.pathname);
        onRouteChanged(path);
    };

    var originalReplaceState = history.replaceState;
    history.replaceState = function(state, title, url) {
        originalReplaceState.apply(history, arguments);
        var path = typeof url === 'string' ? url : (url ? url.toString() : window.location.pathname);
        onRouteChanged(path);
    };

    window.addEventListener('popstate', function() {
        onRouteChanged(window.location.pathname);
    });

    // 3. Click Interceptor for Facebook Home / Logo
    document.addEventListener('click', function(e) {
        var target = e.target;
        while (target && target !== document.body) {
            if (target.tagName === 'A' && target.href) {
                var href = target.getAttribute('href') || '';
                if (href === '/' || href.startsWith('/?') || href.indexOf('facebook.com/?') !== -1 || href.indexOf('facebook.com/home.php') !== -1) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.replace('/messages/t');
                    return;
                }
            }
            target = target.parentElement;
        }
    }, true);

    postBridge('messSystemBridge', { event_type: 'DOM_READY', timestamp: Date.now() });
})();
