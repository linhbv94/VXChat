import Foundation
import AppKit
@preconcurrency import UserNotifications

public final class NotificationManager: NSObject, @unchecked Sendable, UNUserNotificationCenterDelegate {
    public static let shared = NotificationManager()

    public var onSelectThread: ((String, String?) -> Void)?

    override public init() {
        super.init()
        let center = UNUserNotificationCenter.current()
        center.delegate = self
    }

    public func requestAuthorization(completion: (@Sendable (Bool) -> Void)? = nil) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            completion?(granted)
        }
    }

    public func postNotification(
        title: String,
        body: String,
        threadId: String?,
        threadPath: String? = nil,
        soundEnabled: Bool = true,
        completion: (@Sendable (String?) -> Void)? = nil
    ) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        if soundEnabled {
            content.sound = .default
        }
        if let threadId = threadId {
            content.userInfo = ["thread_id": threadId]
            if let threadPath { content.userInfo["thread_path"] = threadPath }
        }

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )

        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
                print("[NotificationManager] Notifications unavailable: authorization=\(settings.authorizationStatus.rawValue)")
                completion?("permission_denied")
                return
            }
            center.add(request) { error in
                if let error { print("[NotificationManager] Delivery error: \(error)") }
                completion?(error?.localizedDescription)
            }
        }
    }

    public func readStatus(completion: @escaping @Sendable ([String: String]) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let authorization: String
            switch settings.authorizationStatus {
            case .authorized: authorization = "authorized"
            case .provisional: authorization = "provisional"
            case .denied: authorization = "denied"
            default: authorization = "not_determined"
            }
            completion(["authorization": authorization, "alerts": settings.alertSetting == .enabled ? "enabled" : "disabled"])
        }
    }

    public func updateDockBadge(count: Int) {
        DispatchQueue.main.async {
            if count > 0 {
                NSApp.dockTile.badgeLabel = "\(count)"
            } else {
                NSApp.dockTile.badgeLabel = nil
            }
        }
    }

    // UNUserNotificationCenterDelegate
    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show notification banner even when app is foreground if window is hidden
        var options: UNNotificationPresentationOptions = [.banner, .list, .badge]
        if notification.request.content.sound != nil { options.insert(.sound) }
        completionHandler(options)
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        if let threadId = userInfo["thread_id"] as? String {
            let threadPath = userInfo["thread_path"] as? String
            DispatchQueue.main.async {
                self.onSelectThread?(threadId, threadPath)
            }
        }
        completionHandler()
    }
}
