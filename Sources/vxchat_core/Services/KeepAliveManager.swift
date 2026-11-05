import Foundation
import AppKit

public final class KeepAliveManager: @unchecked Sendable {
    public static let shared = KeepAliveManager()

    private var activityToken: NSObjectProtocol?
    public var onWake: (@Sendable () -> Void)?

    public init() {
        setupWakeNotification()
    }

    public func enableKeepAlive() {
        if activityToken == nil {
            activityToken = ProcessInfo.processInfo.beginActivity(
                options: [.userInitiatedAllowingIdleSystemSleep],
                reason: "Duy trì kết nối nhận thông báo tin nhắn Messenger"
            )
        }
    }

    public func disableKeepAlive() {
        if let token = activityToken {
            ProcessInfo.processInfo.endActivity(token)
            activityToken = nil
        }
    }

    private func setupWakeNotification() {
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.onWake?()
        }
    }
}
