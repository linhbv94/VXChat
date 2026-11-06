import Foundation
import AppKit
import WebKit
import VXChatCore

@MainActor
public final class PlainWebViewController: NSViewController {
    public let serviceID: ChatServiceID
    public let entryURL: URL
    public private(set) var webView: WKWebView!

    public init(serviceID: ChatServiceID, entryURL: URL? = nil) {
        self.serviceID = serviceID
        self.entryURL = entryURL ?? serviceID.defaultEntryURL
        super.init(nibName: nil, bundle: nil)
    }

    required public init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override public func loadView() {
        let configuration = WKWebViewConfiguration()
        // Dùng chung persistent data store mặc định để lưu trữ phiên đăng nhập, cookie, token
        configuration.websiteDataStore = WKWebsiteDataStore.default()

        if #available(macOS 12.0, *) {
            configuration.preferences.isElementFullscreenEnabled = true
        }

        // Đảm bảo navigator.userAgent đồng bộ với customUserAgent trên client-side
        let userContentController = WKUserContentController()
        let uaJS = "Object.defineProperty(navigator, 'userAgent', { get: () => '\(WebUserAgent.standardDesktop)', configurable: true });"
        let uaScript = WKUserScript(source: uaJS, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        userContentController.addUserScript(uaScript)
        configuration.userContentController = userContentController

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.customUserAgent = WebUserAgent.standardDesktop
        webView.navigationDelegate = self
        webView.uiDelegate = self

        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }

        view = webView
    }

    override public func viewDidLoad() {
        super.viewDidLoad()
        loadEntryURL()
    }

    public func loadEntryURL() {
        var request = URLRequest(url: entryURL)
        request.setValue(WebUserAgent.standardDesktop, forHTTPHeaderField: "User-Agent")
        webView.load(request)
    }

    public func reload() {
        webView.reload()
    }
}

// MARK: - WKNavigationDelegate
extension PlainWebViewController: WKNavigationDelegate {
    public func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        let scheme = url.scheme?.lowercased() ?? ""
        if scheme != "http" && scheme != "https" && scheme != "about" {
            // Cho phép các link tel:, mailto: hoặc app scheme ngoài mở qua hệ thống
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        let host = url.host?.lowercased() ?? ""

        // Kiểm tra xem có phải là domain liên quan đến dịch vụ hoặc OAuth login không
        let isServiceRelated = isAllowedServiceHost(host: host, service: serviceID)

        // Nếu là link người dùng click mở trang web ngoài khác biệt hoàn toàn (không liên quan auth/service)
        if navigationAction.navigationType == .linkActivated && !isServiceRelated {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    private func isAllowedServiceHost(host: String, service: ChatServiceID) -> Bool {
        // Danh sách domain OAuth / SSO phổ biến cho phép đăng nhập
        let authHosts = [
            "accounts.google.com", "appleid.apple.com", "login.microsoftonline.com",
            "auth.openai.com", "auth0.openai.com", "id.zalo.me", "slack.com"
        ]
        if authHosts.contains(where: { host == $0 || host.hasSuffix("." + $0) }) {
            return true
        }

        switch service {
        case .zalo:
            return host.contains("zalo.me") || host.contains("zalopay.vn")
        case .slack:
            return host.contains("slack.com") || host.contains("slack-edge.com") || host.contains("slack-msgs.com")
        case .chatgpt:
            return host.contains("chatgpt.com") || host.contains("openai.com") || host.contains("oaistatic.com") || host.contains("oaiusercontent.com")
        case .messenger:
            return host.contains("facebook.com") || host.contains("messenger.com")
        }
    }

    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        print("[PlainWebViewController] WebContent process terminated for \(serviceID). Reloading...")
        reload()
    }
}

// MARK: - WKUIDelegate
extension PlainWebViewController: WKUIDelegate {
    public func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        // Nếu trang web yêu cầu mở popup (ví dụ: Google Login popup), tải thẳng URL vào webView hiện tại
        if let targetURL = navigationAction.request.url {
            let host = targetURL.host?.lowercased() ?? ""
            if isAllowedServiceHost(host: host, service: serviceID) {
                webView.load(navigationAction.request)
            } else {
                NSWorkspace.shared.open(targetURL)
            }
        }
        return nil
    }
}
