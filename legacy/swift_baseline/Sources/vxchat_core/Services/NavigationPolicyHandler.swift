import Foundation

public enum NavigationPolicyDecision: Equatable, Sendable {
    case allow
    case redirectToMessenger(URL)
    case openExternal(URL)
    case triggerRecovery(reason: String)
    case block
}

public final class NavigationPolicyHandler: @unchecked Sendable {
    public let allowedHosts: Set<String>
    public let authPathPrefixes: [String]
    public let messengerPathPrefixes: [String]
    public let disallowedFeedPaths: Set<String>

    private let lock = NSLock()
    private var redirectTimestamps: [Date] = []
    public var maxRedirectCount: Int = 3
    public var windowSeconds: TimeInterval = 5.0

    public init(
        allowedHosts: Set<String> = [
            "www.facebook.com", "web.facebook.com", "facebook.com", "m.facebook.com",
            "www.messenger.com", "messenger.com",
            "www.fbsbx.com", "fbsbx.com",
            "accountscenter.facebook.com", "auth.facebook.com", "accountscenter.meta.com"
        ],
        authPathPrefixes: [String] = ["/login", "/checkpoint", "/auth", "/two_step_verification", "/recover", "/dialog/oauth"],
        messengerPathPrefixes: [String] = ["/messages", "/maw_proxy_page"],
        disallowedFeedPaths: Set<String> = ["/", "/home.php", "/watch", "/marketplace", "/gaming", "/groups", "/reels"],
        maxRedirectCount: Int = 3,
        windowSeconds: TimeInterval = 5.0
    ) {
        self.allowedHosts = allowedHosts
        self.authPathPrefixes = authPathPrefixes
        self.messengerPathPrefixes = messengerPathPrefixes
        self.disallowedFeedPaths = disallowedFeedPaths
        self.maxRedirectCount = maxRedirectCount
        self.windowSeconds = windowSeconds
    }

    public func resetLoopCounter() {
        lock.lock()
        defer { lock.unlock() }
        redirectTimestamps.removeAll()
    }

    private func isInternalMetaHost(_ host: String) -> Bool {
        if allowedHosts.contains(host) { return true }
        if host.hasSuffix(".facebook.com") || host.hasSuffix(".messenger.com") || host.hasSuffix(".fbsbx.com") || host.hasSuffix(".meta.com") {
            return true
        }
        return false
    }

    public func evaluate(url: URL) -> NavigationPolicyDecision {
        // 1. Validate Scheme
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            return .block
        }

        // 2. Validate Hostname
        guard let host = url.host?.lowercased(), isInternalMetaHost(host) else {
            // External domain -> Open in default browser
            return .openExternal(url)
        }

        let path = url.path.isEmpty ? "/" : url.path

        // 3. Messenger & Internal Proxy Pages (e.g. maw_proxy_page, /messages/t/...) -> Allow internal navigation
        if host.contains("fbsbx.com") || path.contains("maw_proxy_page") {
            return .allow
        }

        for prefix in messengerPathPrefixes {
            if path.hasPrefix(prefix) {
                resetLoopCounter()
                return .allow
            }
        }

        // 4. Authentication / 2FA / Checkpoint -> Allow internal navigation
        for prefix in authPathPrefixes {
            if path.hasPrefix(prefix) {
                return .allow
            }
        }

        // 5. System reserved paths that are not profile links
        let reservedPaths: Set<String> = [
            "/messages", "/login", "/checkpoint", "/auth", "/home.php", "/watch",
            "/marketplace", "/gaming", "/groups", "/reels", "/maw_proxy_page",
            "/help", "/settings", "/notifications", "/privacy", "/policies", "/ajax", "/api"
        ]

        // 6. Profile link (e.g. /profile.php or /username) -> Open in external browser
        if path.hasPrefix("/profile.php") {
            return .openExternal(url)
        }
        let segments = path.split(separator: "/")
        if segments.count == 1, !disallowedFeedPaths.contains(path), !reservedPaths.contains(path) {
            return .openExternal(url)
        }

        // 6. Check Disallowed Feed / Newsfeed routes
        let isFeed = disallowedFeedPaths.contains(path) || (url.query?.contains("sk=h_chr") == true)
        if isFeed {
            lock.lock()
            let now = Date()
            redirectTimestamps = redirectTimestamps.filter { now.timeIntervalSince($0) <= windowSeconds }
            redirectTimestamps.append(now)
            let currentCount = redirectTimestamps.count
            lock.unlock()

            if currentCount > maxRedirectCount {
                return .triggerRecovery(reason: "Phát hiện vòng lặp chuyển hướng từ Facebook (> \(maxRedirectCount) lần trong \(Int(windowSeconds))s).")
            }

            let targetURL = URL(string: "https://www.facebook.com/messages/t")!
            return .redirectToMessenger(targetURL)
        }

        // Default fallback for other internal facebook pages
        return .redirectToMessenger(URL(string: "https://www.facebook.com/messages/t")!)
    }
}
