/* Sidebar previews cover incoming messages even when their conversation is closed.
   Never identify a message by a generic role=row or by Date.now(). */
(function () {
    'use strict';
    if (window.__vxNotificationObserver) return;
    window.__vxNotificationObserver = true;
    var snapshots = new Map();
    var readyAt = 0;
    var observerID = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    var queued = false;
    var unreadCount = -1;
    var sequence = 0;
    var logThread = null;
    var logTail = null;
    var logReadyAt = 0;
    var knownLogIDs = new Set();
    function placeholder(name) { return !name || /^(facebook user|người dùng facebook|messenger)$/i.test(name.trim()); }
    function deliver(payload) {
        function resolve() {
            var cached = snapshots.get(payload.thread_id);
            if (placeholder(payload.sender_name) && cached && !cached.group && !placeholder(cached.sender)) payload.sender_name = cached.sender;
            return !placeholder(payload.sender_name);
        }
        if (resolve()) { post('messNotificationBridge', payload); return; }
        // A newly hydrated profile may briefly expose "Facebook user".
        setTimeout(function () {
            resolve();
            if (placeholder(payload.sender_name)) payload.sender_name = 'Messenger';
            post('messNotificationBridge', payload);
        }, 1500);
    }
    function recentLabel(label) {
        var match = label.match(/^(?:At|Lúc|Vào)\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?,/i);
        if (!match) return false;
        var hour = Number(match[1]);
        if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
        var now = new Date();
        var difference = Math.abs(now.getHours() * 60 + now.getMinutes() - (hour * 60 + Number(match[2])));
        return Math.min(difference, 1440 - difference) <= 3;
    }
    function scanOpenConversation() {
        var route = location.pathname.match(/^\/messages\/(?:e2ee\/)?t\/([a-zA-Z0-9_-]+)\/?$/);
        var log = document.querySelector('[role="main"] [role="log"]');
        var messages = log ? Array.from(log.querySelectorAll('[id^="mid."][aria-label]')) : [];
        if (!route || !messages.length) { logThread = null; logTail = null; return null; }
        var id = route[1];
        if (id !== logThread) {
            logThread = id;
            logReadyAt = Date.now() + 2500;
            logTail = null;
        }
        var previousIndex = messages.findIndex(function (message) { return message.id === logTail; });
        var live = Date.now() >= logReadyAt && previousIndex >= 0;
        messages.forEach(function (message, index) {
            if (live && index > previousIndex && !knownLogIDs.has(message.id)) {
                // Comet exposes a stable message ID and an accessible sender/preview.
                var label = message.getAttribute('aria-label') || '';
                var match = label.match(/^(?:At|Lúc|Vào)\s+.*?,\s+([^,:]+?)(?::\s*([\s\S]*))?$/);
                if (match && recentLabel(label) && !/^(you|bạn)$/i.test(match[1].trim())) {
                    deliver({
                        event_type: 'NEW_MESSAGE', message_id: message.id,
                        sender_name: match[1].trim(), snippet: (match[2] || 'Sent an attachment').slice(0, 120),
                        thread_id: id, thread_path: location.pathname, timestamp: Date.now()
                    });
                }
            }
            knownLogIDs.add(message.id);
        });
        logTail = messages[messages.length - 1].id;
        if (knownLogIDs.size > 2000) {
            knownLogIDs = new Set(messages.map(function (message) { return message.id; }));
        }
        return live ? id : null;
    }
    function post(name, payload) {
        var handlers = window.webkit && window.webkit.messageHandlers;
        if (handlers && handlers[name]) handlers[name].postMessage(payload);
    }
    function text(node) {
        var copy = node.cloneNode(true);
        copy.querySelectorAll('img[alt]').forEach(function (img) { img.replaceWith(document.createTextNode(img.alt)); });
        return copy.textContent.replace(/\s+/g, ' ').trim();
    }
    function readRow(row, index) {
        var anchor = row.querySelector('a[href*="/messages/"]');
        if (!anchor) return null;
        var url;
        try { url = new URL(anchor.getAttribute('href'), location.href); } catch (_) { return null; }
        var match = url.pathname.match(/^\/messages\/(e2ee\/)?t\/([a-zA-Z0-9_-]+)\/?$/);
        if (!match || url.origin !== location.origin) return null;
        var spans = Array.from(anchor.querySelectorAll('span[dir="auto"]')).filter(function (span) {
            return !span.querySelector('abbr, time') && !/^[\s·]*$/.test(span.textContent);
        });
        if (spans.length < 2) return null;
        var content = row.textContent || '';
        var preview = text(spans[1]);
        if (!preview) return null;
        var time = anchor.querySelector('abbr, time');
        var absoluteTime = time && (time.getAttribute('data-utime') || time.getAttribute('datetime') || time.getAttribute('title')) || '';
        var age = time ? text(time).toLowerCase() : '';
        return {
            id: match[2], path: url.pathname, group: /^(group chat|nhóm chat|đoạn chat nhóm)\s*:/i.test(anchor.getAttribute('aria-label') || ''), sender: text(spans[0]), preview: preview,
            fingerprint: preview + '\u0000' + absoluteTime,
            unread: /unread message\s*:|tin nhắn chưa đọc\s*:/i.test(content),
            outgoing: /^(you\s*:|you sent\b|bạn\s*:|bạn đã gửi\b|mình\s*:)/i.test(preview),
            muted: /notifications? (?:are )?(?:muted|off)|đã tắt thông báo|đã tắt tiếng/i.test(content + ' ' + (row.getAttribute('aria-label') || '')),
            recent: /^(now|just now|vừa xong|bây giờ|[012]\s*(m|min|phút))$/.test(age),
            index: index
        };
    }
    function scan() {
        queued = false;
        if (!/^\/messages(?:\/|$)/.test(location.pathname)) return;
        var openConversation = scanOpenConversation();
        var rows = document.querySelectorAll('[role="navigation"] [role="row"]');
        var current = Array.from(rows).map(readRow).filter(Boolean);
        if (!current.length) return; // Loading/remount is not a zero unread count.
        if (!readyAt) readyAt = Date.now() + 2500;
        var hydrating = Date.now() < readyAt;
        var count = 0;
        current.forEach(function (item) {
            if (item.unread) count++;
            var previous = snapshots.get(item.id);
            var changed = previous && (previous.fingerprint !== item.fingerprint || !previous.unread);
            // A new top row may be a new conversation, but old virtualized rows are baseline only.
            var newConversation = !previous && item.index === 0 && item.recent;
            var repeatedAtTop = previous && previous.index > 0 && item.index === 0 && item.recent;
            if (!hydrating && item.id !== openConversation && item.unread && !item.outgoing && !item.muted && (changed || newConversation || repeatedAtTop)) {
                deliver({
                    event_type: 'NEW_MESSAGE', message_id: 'sidebar_' + observerID + '_' + item.id + '_' + (++sequence),
                    sender_name: item.sender || 'Messenger', snippet: item.preview.slice(0, 120),
                    thread_id: item.id, thread_path: item.path, timestamp: Date.now()
                });
            }
            snapshots.set(item.id, item);
        });
        if (snapshots.size > 1000) {
            var visible = new Set(current.map(function (item) { return item.id; }));
            snapshots.forEach(function (_, id) { if (!visible.has(id) && snapshots.size > 800) snapshots.delete(id); });
        }
        if (count !== unreadCount) {
            unreadCount = count;
            post('messNotificationBridge', { event_type: 'BADGE_SYNC', unread_count: count, timestamp: Date.now() });
        }
    }
    function schedule() {
        if (!queued) { queued = true; setTimeout(scan, 180); }
    }
    new MutationObserver(schedule).observe(document.documentElement, {
        subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ['aria-label', 'aria-current', 'href', 'data-utime', 'datetime', 'title']
    });
    addEventListener('vx_route_changed', schedule);
    setInterval(scan, 2000);
    scan();
})();
