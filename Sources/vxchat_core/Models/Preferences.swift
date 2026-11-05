import Foundation

public struct Preferences: Codable, Sendable, Equatable {
    public var version: String
    public var launchAtLogin: Bool
    public var closeToHide: Bool
    public var soundEnabled: Bool
    public var badgeEnabled: Bool
    public var autoCleanHeader: Bool
    public var blueBubbleEnabled: Bool
    public var theme: String
    public var language: String

    public init(
        version: String = "1.0.0",
        launchAtLogin: Bool = true,
        closeToHide: Bool = true,
        soundEnabled: Bool = true,
        badgeEnabled: Bool = true,
        autoCleanHeader: Bool = true,
        blueBubbleEnabled: Bool = true,
        theme: String = "dark",
        language: String = "vi"
    ) {
        self.version = version
        self.launchAtLogin = launchAtLogin
        self.closeToHide = closeToHide
        self.soundEnabled = soundEnabled
        self.badgeEnabled = badgeEnabled
        self.autoCleanHeader = autoCleanHeader
        self.blueBubbleEnabled = blueBubbleEnabled
        self.theme = theme
        self.language = language
    }

    enum CodingKeys: String, CodingKey {
        case version
        case launchAtLogin = "launch_at_login"
        case closeToHide = "close_to_hide"
        case soundEnabled = "sound_enabled"
        case badgeEnabled = "badge_enabled"
        case autoCleanHeader = "auto_clean_header"
        case blueBubbleEnabled = "blue_bubble_enabled"
        case theme
        case language
    }
}

public final class PreferencesManager: @unchecked Sendable {
    public static let shared = PreferencesManager()

    private let fileManager = FileManager.default
    private let lock = NSLock()
    private var cachedPreferences: Preferences?
    private let explicitStorageURL: URL?

    public var storageURL: URL {
        if let explicitStorageURL { return explicitStorageURL }
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let appDir = appSupport.appendingPathComponent("VXMessChat", isDirectory: true) // Legacy storage identity: preserve existing preferences after the rename.
        if !fileManager.fileExists(atPath: appDir.path) {
            try? fileManager.createDirectory(at: appDir, withIntermediateDirectories: true, attributes: nil)
        }
        return appDir.appendingPathComponent("preferences.json")
    }

    public init(storageURL: URL? = nil) { explicitStorageURL = storageURL }

    public func load() -> Preferences {
        lock.lock()
        defer { lock.unlock() }

        if let cached = cachedPreferences {
            return cached
        }

        let url = storageURL
        guard fileManager.fileExists(atPath: url.path),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode(Preferences.self, from: data) else {
            let defaultPrefs = Preferences()
            cachedPreferences = defaultPrefs
            return defaultPrefs
        }

        cachedPreferences = decoded
        return decoded
    }

    public func save(_ preferences: Preferences) throws {
        lock.lock()
        defer { lock.unlock() }

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(preferences)

        let url = storageURL
        try fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
        cachedPreferences = preferences
    }
}
