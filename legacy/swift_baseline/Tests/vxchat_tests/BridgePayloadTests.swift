import Foundation
import VXChatCore

struct BridgePayloadTests {
    static func run() throws {
        print("  --> Running BridgePayloadTests...")
        try testDecodeNewMessagePayload()
        try testDecodeBadgeSyncPayload()
        try testDecodeNavigationBridgePayload()
        print("  ✓ BridgePayloadTests: PASS")
    }

    static func testDecodeNewMessagePayload() throws {
        let json = """
        {
            "event_type": "NEW_MESSAGE",
            "message_id": "msg_12345",
            "sender_name": "Nguyễn Văn A",
            "snippet": "Chào bạn, dự án đã xong!",
            "thread_id": "1000012345",
            "timestamp": 1730700000000
        }
        """.data(using: .utf8)!

        let payload = try JSONDecoder().decode(NotificationBridgePayload.self, from: json)
        assertEqual(payload.eventType, .newMessage)
        assertEqual(payload.messageId, "msg_12345")
        assertEqual(payload.senderName, "Nguyễn Văn A")
        assertEqual(payload.snippet, "Chào bạn, dự án đã xong!")
        assertEqual(payload.threadId, "1000012345")
    }

    static func testDecodeBadgeSyncPayload() throws {
        let json = """
        {
            "event_type": "BADGE_SYNC",
            "unread_count": 5,
            "timestamp": 1730700000000
        }
        """.data(using: .utf8)!

        let payload = try JSONDecoder().decode(NotificationBridgePayload.self, from: json)
        assertEqual(payload.eventType, .badgeSync)
        assertEqual(payload.unreadCount, 5)
    }

    static func testDecodeNavigationBridgePayload() throws {
        let json = """
        {
            "event_type": "SPA_ROUTE_CHANGED",
            "target_path": "/home.php",
            "is_disallowed_feed": true,
            "timestamp": 1730700000000
        }
        """.data(using: .utf8)!

        let payload = try JSONDecoder().decode(NavigationBridgePayload.self, from: json)
        assertEqual(payload.eventType, .spaRouteChanged)
        assertEqual(payload.targetPath, "/home.php")
        assertTrue(payload.isDisallowedFeed)
    }
}
