import Foundation
import VXChatCore

struct PreferencesTests {
    static func run() throws {
        print("  --> Running PreferencesTests...")
        testDefaultPreferencesValues()
        try testPreferencesJSONCodable()
        try testFirstSaveAndReopen()
        print("  ✓ PreferencesTests: PASS")
    }

    static func testDefaultPreferencesValues() {
        let prefs = Preferences()
        assertEqual(prefs.version, "1.0.0")
        assertTrue(prefs.launchAtLogin)
        assertTrue(prefs.closeToHide)
        assertTrue(prefs.soundEnabled)
        assertTrue(prefs.badgeEnabled)
        assertTrue(prefs.autoCleanHeader)
        assertTrue(prefs.blueBubbleEnabled)
        assertEqual(prefs.theme, "dark")
        assertEqual(prefs.language, "vi")
    }

    static func testFirstSaveAndReopen() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("vxchat_preferences_" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let url = dir.appendingPathComponent("preferences.json")
        let manager = PreferencesManager(storageURL: url)
        var prefs = manager.load()
        prefs.badgeEnabled = false
        prefs.soundEnabled = false
        try manager.save(prefs)
        assertEqual(PreferencesManager(storageURL: url).load(), prefs)
        prefs.soundEnabled = true
        try manager.save(prefs)
        assertEqual(PreferencesManager(storageURL: url).load(), prefs)
    }

    static func testPreferencesJSONCodable() throws {
        let prefs = Preferences(
            version: "1.0.0",
            launchAtLogin: false,
            closeToHide: true,
            soundEnabled: false,
            badgeEnabled: true,
            autoCleanHeader: true,
            blueBubbleEnabled: false,
            theme: "dark",
            language: "vi"
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(prefs)

        let decoded = try JSONDecoder().decode(Preferences.self, from: data)
        assertEqual(decoded, prefs)

        // Verify JSON keys match schema
        let jsonString = String(data: data, encoding: .utf8)!
        assertTrue(jsonString.contains("\"launch_at_login\" : false"))
        assertTrue(jsonString.contains("\"close_to_hide\" : true"))
        assertTrue(jsonString.contains("\"sound_enabled\" : false"))
        assertTrue(jsonString.contains("\"badge_enabled\" : true"))
        assertTrue(jsonString.contains("\"auto_clean_header\" : true"))
        assertTrue(jsonString.contains("\"blue_bubble_enabled\" : false"))
    }
}
