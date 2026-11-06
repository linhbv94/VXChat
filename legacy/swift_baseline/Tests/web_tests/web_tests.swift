import AppKit
import WebKit
import VXChatCore

@MainActor
final class FixtureServer: NSObject, WKURLSchemeHandler, WKScriptMessageHandler {
    let html: Data
    var events = [[String: Any]]()
    init(html: Data) { self.html = html }
    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        urlSchemeTask.didReceive(URLResponse(url: urlSchemeTask.request.url!, mimeType: "text/html", expectedContentLength: html.count, textEncodingName: "utf-8"))
        urlSchemeTask.didReceive(html)
        urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {}
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if let event = message.body as? [String: Any] { events.append(event) }
    }
    var notifications: [[String: Any]] { events.filter { $0["event_type"] as? String == "NEW_MESSAGE" } }
}

@main
struct WebTests {
    @MainActor
    static func main() async throws {
        setbuf(stdout, nil)
        _ = NSApplication.shared
        let directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = directory.appendingPathComponent("../../Resources").standardizedFileURL
        let server = FixtureServer(html: try Data(contentsOf: directory.appendingPathComponent("messenger_fixture.html")))
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.setURLSchemeHandler(server, forURLScheme: "vxtest")
        let controller = configuration.userContentController
        for name in ["messNotificationBridge", "messNavigationBridge", "messSystemBridge"] { controller.add(server, name: name) }
        for (name, id) in [("clean_header", "vx_clean_header_style"), ("chat_bubble", "vx_chat_bubble_style")] {
            let css = try String(contentsOf: resources.appendingPathComponent(name + ".css"), encoding: .utf8)
            controller.addUserScript(WKUserScript(source: ScriptInjector.shared.makeCSSInjectionScript(css: css, styleID: id), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        for name in ["dom_observer", "messenger_layout", "notification_observer"] {
            controller.addUserScript(WKUserScript(source: try String(contentsOf: resources.appendingPathComponent(name + ".js"), encoding: .utf8), injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1200, height: 768), configuration: configuration)
        // An offscreen window gives WKWebView a real layout/render lifecycle.
        let window = NSWindow(contentRect: NSRect(x: -5000, y: -5000, width: 1200, height: 768), styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = web
        web.load(URLRequest(url: URL(string: "vxtest://fixture/messages/t/active")!))
        for _ in 0..<100 {
            try await Task.sleep(for: .milliseconds(100))
            if !web.isLoading, web.url != nil { break }
        }
        func check(_ condition: Bool, _ name: String) throws {
            if !condition { throw NSError(domain: "WebTests", code: 1, userInfo: [NSLocalizedDescriptionKey: name]) }
            print("PASS: \(name)")
        }
        func evaluate(_ js: String) async throws -> Any {
            do {
                let encoded = String(data: try JSONSerialization.data(withJSONObject: js, options: .fragmentsAllowed), encoding: .utf8)!
                let value = try await web.evaluateJavaScript("JSON.stringify(eval(\(encoded)))") as? String ?? "null"
                return try JSONSerialization.jsonObject(with: Data(value.utf8), options: .fragmentsAllowed)
            } catch { print("JS FAILED: \(js)"); throw error }
        }
        func settle() async throws { try await Task.sleep(for: .milliseconds(450)) }
        try await Task.sleep(for: .seconds(3))
        try check(server.notifications.isEmpty, "Hydration does not notify old unread messages")
        for size in [NSSize(width: 1200, height: 768), NSSize(width: 800, height: 568), NSSize(width: 1500, height: 940)] {
            web.setFrameSize(size)
            try await settle()
            let ok = try await evaluate("(() => { const s=document.querySelector('.shell').getBoundingClientRect(), c=document.querySelector('#composer').getBoundingClientRect(); return Math.abs(s.bottom-innerHeight)<1 && c.bottom<=innerHeight && c.height>=59 && document.documentElement.scrollHeight<=innerHeight+1 && document.querySelector('[data-vx-message-scroll]').scrollHeight>document.querySelector('[data-vx-message-scroll]').clientHeight; })()") as? Bool
            try check(ok == true, "Shell, composer and document bounds at \(size)")
        }
        let track = try await evaluate("getComputedStyle(document.querySelector('[data-vx-message-scroll]'),'::-webkit-scrollbar-track').backgroundColor") as? String
        try check(track == "rgb(36, 37, 38)", "Opaque neutral scrollbar track masks gradient")
        _ = try await evaluate("document.querySelector('#preview_one').firstChild.data='New incoming'; true")
        try await settle()
        try check(server.notifications.count == 1, "Character data update in unopened conversation emits once")
        try check(server.notifications.first?["thread_path"] as? String == "/messages/e2ee/t/one/", "Encrypted deep link path is retained")
        _ = try await evaluate("document.querySelector('#row_one abbr').textContent='3h'; document.querySelector('#threads').innerHTML=document.querySelector('#threads').innerHTML; true")
        try await settle()
        try check(server.notifications.count == 1, "Clock changes and React remount do not notify again")
        _ = try await evaluate("document.querySelector('#preview_one').textContent='You: sent this'; true")
        try await settle()
        try check(server.notifications.count == 1, "Own outgoing messages do not notify")
        _ = try await evaluate("let old=document.querySelector('#row_one').cloneNode(true); old.id='older';old.querySelector('a').href='/messages/t/older/';old.querySelector('[dir=auto]').textContent='Older';old.querySelectorAll('[dir=auto]')[1].textContent='Old paginated message';document.querySelector('#threads').append(old);true")
        try await settle()
        try check(server.notifications.count == 1, "Old paginated unread thread is baseline only")
        _ = try await evaluate("let fresh=document.querySelector('#row_one').cloneNode(true);fresh.id='fresh';fresh.querySelector('a').href='/messages/t/new/';fresh.querySelectorAll('[dir=auto]')[1].textContent='Brand new conversation';fresh.querySelector('abbr').textContent='now';document.querySelector('#threads').prepend(fresh);true")
        try await settle()
        try check(server.notifications.count == 2, "New recent conversation at head notifies")
        _ = try await evaluate("let live=document.createElement('div');live.id='mid.fixture_live';live.setAttribute('aria-label','At '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+', Facebook user: Hello live');document.querySelector('.filler').append(live);true")
        try await settle()
        try check(server.notifications.count == 3, "Open conversation emits using stable message ID without unread sidebar marker")
        try check(server.notifications.last?["sender_name"] as? String == "Claire Example", "Placeholder sender resolves to cached real conversation name")
        _ = try await evaluate("let own=document.createElement('div');own.id='mid.fixture_own';own.setAttribute('aria-label','At '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+', You: sent');document.querySelector('.filler').append(own);let historic=document.createElement('div');historic.id='mid.fixture_historic';historic.setAttribute('aria-label','At January 1, 2020, Alice: old');document.querySelector('.filler').append(historic);true")
        try await settle()
        try check(server.notifications.count == 3, "Log observer ignores own messages and historical append")
        _ = try await evaluate("document.getElementById('vx_clean_header_style').remove();window.__vxMessengerLayout();true")
        try await settle()
        try check(try await evaluate("document.documentElement.hasAttribute('data-vx-messenger-clean')") as? Bool == false, "Disabling clean header restores unmodified route layout")
        try check(ConversationRoute.url(threadID: "one", path: "/messages/e2ee/t/one/")?.path == "/messages/e2ee/t/one", "Native route preserves e2ee")
        try check(ConversationRoute.url(threadID: "one", path: "//evil.example/messages/t/one") == nil, "Native route rejects external path")
        try check(ConversationRoute.url(threadID: "one", path: "/messages/t/other/") == nil, "Native route rejects mismatched thread")
        window.close()
        print("ALL WEBKIT FIXTURE CHECKS PASSED")
    }
}
