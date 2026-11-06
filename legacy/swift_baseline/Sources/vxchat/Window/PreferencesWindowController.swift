import Foundation
import AppKit
import WebKit
import VXChatCore

public final class PreferencesWindowController: NSWindowController, WKScriptMessageHandler {
    public static let shared = PreferencesWindowController()

    private var webView: WKWebView!
    public var onPreferencesChanged: (() -> Void)?
    public var onLogoutRequested: (() -> Void)?

    public init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 672, height: 560),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Cài đặt — VXChat"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(calibratedRed: 20/255, green: 24/255, blue: 33/255, alpha: 1.0) // #141821
        window.isMovableByWindowBackground = true
        window.center()

        super.init(window: window)

        setupWebView(window: window)
    }

    required public init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupWebView(window: NSWindow) {
        let configuration = WKWebViewConfiguration()
        let userContent = WKUserContentController()
        userContent.add(self, name: "settingsBridge")
        configuration.userContentController = userContent

        webView = WKWebView(frame: window.contentView!.bounds, configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground") // Transparent background

        window.contentView = webView

        loadSettingsHTML()
    }

    private func loadSettingsHTML() {
        if let htmlPath = Bundle.main.path(forResource: "settings", ofType: "html") {
            let fileURL = URL(fileURLWithPath: htmlPath)
            webView.loadFileURL(fileURL, allowingReadAccessTo: fileURL.deletingLastPathComponent())
        }
    }

    override public func showWindow(_ sender: Any?) {
        super.showWindow(sender)
        // Refresh preferences when window is shown
        sendCurrentPreferencesToWeb()
        refreshNotificationStatus()
    }

    private func sendCurrentPreferencesToWeb() {
        let prefs = PreferencesManager.shared.load()
        if let data = try? JSONEncoder().encode(prefs),
           let jsonString = String(data: data, encoding: .utf8) {
            let js = "window.__setPreferences && window.__setPreferences(\(jsonString));"
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    private func refreshNotificationStatus() {
        NotificationManager.shared.readStatus { [weak self] status in
            Task { @MainActor in
                guard let data = try? JSONSerialization.data(withJSONObject: status),
                      let json = String(data: data, encoding: .utf8) else { return }
                self?.webView.evaluateJavaScript("window.__setNotificationStatus && window.__setNotificationStatus(\(json));", completionHandler: nil)
            }
        }
    }

    // MARK: - WKScriptMessageHandler
    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "settingsBridge", message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.isFileURL == true,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            return
        }

        switch action {
        case "load":
            sendCurrentPreferencesToWeb()
            refreshNotificationStatus()

        case "notification_status":
            refreshNotificationStatus()

        case "test_notification":
            let prefs = PreferencesManager.shared.load()
            let english = prefs.language == "en"
            NotificationManager.shared.postNotification(
                title: "VXChat",
                body: english ? "Test notification. Notifications are working." : "Thông báo thử. VXChat đã kết nối thông báo macOS.",
                threadId: nil, soundEnabled: prefs.soundEnabled
            ) { [weak self] error in
                Task { @MainActor in
                    let result = ["result": error == nil ? "scheduled" : "failed"]
                    if let data = try? JSONSerialization.data(withJSONObject: result), let json = String(data: data, encoding: .utf8) {
                        self?.webView.evaluateJavaScript("window.__setNotificationTestResult && window.__setNotificationTestResult(\(json));", completionHandler: nil)
                    }
                    self?.refreshNotificationStatus()
                }
            }

        case "save":
            if let dataDict = body["data"] as? [String: Any] {
                updatePreferences(from: dataDict)
            }

        case "reset":
            let defaults = Preferences()
            try? PreferencesManager.shared.save(defaults)
            try? AutoLaunchManager.shared.setEnabled(defaults.launchAtLogin)
            onPreferencesChanged?()
            sendCurrentPreferencesToWeb()

        case "logout":
            let alert = NSAlert()
            alert.messageText = "Đăng xuất tài khoản?"
            alert.informativeText = "Toàn bộ cookie và phiên đăng nhập hiện tại sẽ bị xóa sạch khỏi ứng dụng."
            alert.alertStyle = .warning
            alert.addButton(withTitle: "Đăng xuất")
            alert.addButton(withTitle: "Hủy")

            if alert.runModal() == .alertFirstButtonReturn {
                onLogoutRequested?()
                window?.close()
            }

        case "open_url":
            if let data = body["data"] as? [String: Any],
               let urlString = data["url"] as? String,
               let url = URL(string: urlString) {
                NSWorkspace.shared.open(url)
            }

        case "close":
            window?.close()

        default:
            break
        }
    }

    private func updatePreferences(from dict: [String: Any]) {
        var prefs = PreferencesManager.shared.load()

        if let theme = dict["theme"] as? String {
            prefs.theme = theme
        }
        if let language = dict["language"] as? String {
            prefs.language = language
        }
        if let launchAtLogin = dict["launch_at_login"] as? Bool {
            prefs.launchAtLogin = launchAtLogin
            try? AutoLaunchManager.shared.setEnabled(launchAtLogin)
        }
        if let closeToHide = dict["close_to_hide"] as? Bool {
            prefs.closeToHide = closeToHide
        }
        if let autoCleanHeader = dict["auto_clean_header"] as? Bool {
            prefs.autoCleanHeader = autoCleanHeader
        }
        if let blueBubbleEnabled = dict["blue_bubble_enabled"] as? Bool {
            prefs.blueBubbleEnabled = blueBubbleEnabled
        }
        if let soundEnabled = dict["sound_enabled"] as? Bool {
            prefs.soundEnabled = soundEnabled
        }
        if let badgeEnabled = dict["badge_enabled"] as? Bool {
            prefs.badgeEnabled = badgeEnabled
        }

        do {
            try PreferencesManager.shared.save(prefs)
            if !prefs.badgeEnabled { NotificationManager.shared.updateDockBadge(count: 0) }
            onPreferencesChanged?()
        } catch {
            print("[Preferences] Save failed: \(error)")
            sendCurrentPreferencesToWeb()
        }
    }
}
