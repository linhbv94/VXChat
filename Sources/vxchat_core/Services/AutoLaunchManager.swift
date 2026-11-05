import Foundation
import ServiceManagement

public final class AutoLaunchManager: @unchecked Sendable {
    public static let shared = AutoLaunchManager()

    public init() {}

    public var status: SMAppService.Status {
        return SMAppService.mainApp.status
    }

    public var isEnabled: Bool {
        return SMAppService.mainApp.status == .enabled
    }

    public func setEnabled(_ enable: Bool) throws {
        let service = SMAppService.mainApp
        if enable {
            if service.status != .enabled {
                try service.register()
            }
        } else {
            if service.status == .enabled || service.status == .requiresApproval {
                try service.unregister()
            }
        }
    }
}
