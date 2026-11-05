import Foundation

public enum BridgeEventType: String, Codable, Sendable {
    case newMessage = "NEW_MESSAGE"
    case badgeSync = "BADGE_SYNC"
    case spaRouteChanged = "SPA_ROUTE_CHANGED"
    case domReady = "DOM_READY"
    case selectorMissing = "SELECTOR_MISSING"
}

public struct NotificationBridgePayload: Codable, Sendable {
    public let eventType: BridgeEventType
    public let messageId: String?
    public let senderName: String?
    public let snippet: String?
    public let threadId: String?
    public let threadPath: String?
    public let unreadCount: Int?
    public let timestamp: Int64

    enum CodingKeys: String, CodingKey {
        case eventType = "event_type"
        case messageId = "message_id"
        case senderName = "sender_name"
        case snippet
        case threadId = "thread_id"
        case threadPath = "thread_path"
        case unreadCount = "unread_count"
        case timestamp
    }
}

public struct NavigationBridgePayload: Codable, Sendable {
    public let eventType: BridgeEventType
    public let targetPath: String
    public let isDisallowedFeed: Bool
    public let timestamp: Int64

    enum CodingKeys: String, CodingKey {
        case eventType = "event_type"
        case targetPath = "target_path"
        case isDisallowedFeed = "is_disallowed_feed"
        case timestamp
    }
}

public struct SystemBridgePayload: Codable, Sendable {
    public let eventType: BridgeEventType
    public let appliedFeatures: [String]?
    public let missingSelectorKey: String?
    public let timestamp: Int64

    enum CodingKeys: String, CodingKey {
        case eventType = "event_type"
        case appliedFeatures = "applied_features"
        case missingSelectorKey = "missing_selector_key"
        case timestamp
    }
}
