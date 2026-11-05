import Foundation

public enum ConversationRoute {
    public static func threadID(from path: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: "^/messages/(?:e2ee/)?t/([A-Za-z0-9_-]+)/?$"),
              let match = regex.firstMatch(in: path, range: NSRange(path.startIndex..., in: path)),
              let range = Range(match.range(at: 1), in: path) else { return nil }
        return String(path[range])
    }

    public static func url(threadID: String, path: String? = nil) -> URL? {
        let destination = path ?? "/messages/t/\(threadID)"
        guard self.threadID(from: destination) == threadID else { return nil }
        return URL(string: "https://www.facebook.com" + destination)
    }
}
