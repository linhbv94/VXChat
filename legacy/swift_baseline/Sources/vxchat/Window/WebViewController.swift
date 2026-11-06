import Foundation
import AppKit
import WebKit
import VXChatCore

@MainActor
public final class WebViewController: NSViewController {
    public private(set) var webView: WKWebView!
    private let policyHandler = NavigationPolicyHandler()
    private var recoveryOverlay: RecoveryOverlayView?
    public var currentThreadId: String?
    private var deliveredMessageIDs = [String]()
    private var latestUnreadCount = 0
    public var onNavigationStateChanged: ((Bool) -> Void)?

    override public func loadView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = WKWebsiteDataStore.default()

        // Configure Media Permissions for Messenger Audio/Video Calls
        if #available(macOS 12.0, *) {
            configuration.preferences.isElementFullscreenEnabled = true
        }

        // Register User Content Controller
        let userContent = WKUserContentController()
        userContent.add(self, name: "messNotificationBridge")
        userContent.add(self, name: "messNavigationBridge")
        userContent.add(self, name: "messSystemBridge")

        // Inject scripts
        let prefs = PreferencesManager.shared.load()
        let scripts = ScriptInjector.shared.makeUserScripts(preferences: prefs)
        for script in scripts {
            userContent.addUserScript(script)
        }

        configuration.userContentController = userContent

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self

        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }

        view = webView
    }

    public func reapplyScripts() {
        let prefs = PreferencesManager.shared.load()
        NotificationManager.shared.updateDockBadge(count: prefs.badgeEnabled ? latestUnreadCount : 0)
        let scripts = ScriptInjector.shared.makeUserScripts(preferences: prefs)
        webView.configuration.userContentController.removeAllUserScripts()
        for script in scripts {
            webView.configuration.userContentController.addUserScript(script)
        }

        // Reinstall both enabled styles and observers without retaining stale CSS.
        if !prefs.autoCleanHeader {
            webView.evaluateJavaScript("document.getElementById('vx_clean_header_style')?.remove();", completionHandler: nil)
        }
        for script in scripts {
            webView.evaluateJavaScript(script.source, completionHandler: nil)
        }
        webView.evaluateJavaScript("window.__vxMessengerLayout && window.__vxMessengerLayout();", completionHandler: nil)
    }

    override public func viewDidLoad() {
        super.viewDidLoad()
        loadMessenger()
    }

    public func loadMessenger() {
        hideRecoveryOverlay()
        policyHandler.resetLoopCounter()
        let target = URL(string: "https://www.facebook.com/messages/t")!
        webView.load(URLRequest(url: target))
    }

    public func navigateToThread(id: String, path: String? = nil) {
        hideRecoveryOverlay()
        guard let target = ConversationRoute.url(threadID: id, path: path) else { return }
        webView.load(URLRequest(url: target))
    }

    public func reload() {
        hideRecoveryOverlay()
        policyHandler.resetLoopCounter()
        webView.reload()
    }

    // MARK: - Recovery Overlay
    private func showRecoveryOverlay(reason: String) {
        if recoveryOverlay == nil {
            let overlay = RecoveryOverlayView(frame: view.bounds)
            overlay.autoresizingMask = [.width, .height]
            overlay.onRetry = { [weak self] in
                self?.loadMessenger()
            }
            view.addSubview(overlay)
            recoveryOverlay = overlay
        }
        recoveryOverlay?.isHidden = false
    }

    private func hideRecoveryOverlay() {
        recoveryOverlay?.isHidden = true
    }
}

// MARK: - WKNavigationDelegate
extension WebViewController: WKNavigationDelegate {
    public func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        let decision = policyHandler.evaluate(url: url)
        switch decision {
        case .allow:
            decisionHandler(.allow)

        case .redirectToMessenger(let targetURL):
            decisionHandler(.cancel)
            webView.load(URLRequest(url: targetURL))

        case .openExternal(let externalURL):
            decisionHandler(.cancel)
            NSWorkspace.shared.open(externalURL)

        case .triggerRecovery(let reason):
            decisionHandler(.cancel)
            showRecoveryOverlay(reason: reason)

        case .block:
            decisionHandler(.cancel)
        }
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        currentThreadId = ConversationRoute.threadID(from: webView.url?.path ?? "")
        let currentURL = webView.url?.absoluteString.lowercased() ?? ""
        let isLogin = currentURL.contains("/login") || currentURL.contains("login.php")
        onNavigationStateChanged?(isLogin)
    }

    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // Recover cleanly if WebContent process is terminated due to memory pressure
        print("[WebViewController] WebContent process terminated. Reloading...")
        reload()
    }
}

// MARK: - WKUIDelegate
extension WebViewController: WKUIDelegate {
    public func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            let decision = policyHandler.evaluate(url: url)
            switch decision {
            case .allow:
                webView.load(navigationAction.request)
            case .redirectToMessenger(let target):
                webView.load(URLRequest(url: target))
            case .openExternal(let ext):
                NSWorkspace.shared.open(ext)
            case .triggerRecovery(let reason):
                showRecoveryOverlay(reason: reason)
            case .block:
                break
            }
        }
        return nil
    }
}

// MARK: - WKScriptMessageHandler
extension WebViewController: WKScriptMessageHandler {
    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // 1. Validate security frame and origin
        guard message.frameInfo.isMainFrame else { return }
        let host = message.frameInfo.securityOrigin.host.lowercased()
        guard policyHandler.allowedHosts.contains(host) else { return }

        let prefs = PreferencesManager.shared.load()

        switch message.name {
        case "messNotificationBridge":
            guard let dict = message.body as? [String: Any],
                  let data = try? JSONSerialization.data(withJSONObject: dict),
                  let payload = try? JSONDecoder().decode(NotificationBridgePayload.self, from: data) else { return }
            if payload.eventType == .newMessage {
                guard let id = payload.messageId, !id.isEmpty,
                      let sender = payload.senderName, !sender.isEmpty,
                      let snippet = payload.snippet,
                      let threadID = payload.threadId,
                      ConversationRoute.url(threadID: threadID, path: payload.threadPath) != nil,
                      !deliveredMessageIDs.contains(id) else { return }
                deliveredMessageIDs.append(id)
                if deliveredMessageIDs.count > 256 { deliveredMessageIDs.removeFirst() }
                let isWindowActive = view.window?.isVisible == true && view.window?.isKeyWindow == true && NSApp.isActive
                if !(isWindowActive && threadID == currentThreadId) {
                    NotificationManager.shared.postNotification(
                        title: String(sender.prefix(120)), body: String(snippet.prefix(120)),
                        threadId: threadID, threadPath: payload.threadPath, soundEnabled: prefs.soundEnabled
                    )
                }
            } else if payload.eventType == .badgeSync, let count = payload.unreadCount, count >= 0 {
                latestUnreadCount = count
                NotificationManager.shared.updateDockBadge(count: prefs.badgeEnabled ? count : 0)
            }

        case "messNavigationBridge":
            guard let dict = message.body as? [String: Any],
                  let path = dict["target_path"] as? String,
                  let isDisallowed = dict["is_disallowed_feed"] as? Bool else { return }
            let routePath = URL(string: path, relativeTo: webView.url)?.path ?? path
            currentThreadId = ConversationRoute.threadID(from: routePath)
            if isDisallowed { loadMessenger() }

        case "messSystemBridge":
            guard let dict = message.body as? [String: Any] else { return }
            print("[WebViewController] messSystemBridge: \(dict)")

        default:
            break
        }
    }
}
