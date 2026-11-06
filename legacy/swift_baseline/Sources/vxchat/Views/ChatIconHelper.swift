import Foundation
import AppKit
import VXChatCore

@MainActor
public enum ChatIconHelper {
    private static var iconCache: [ChatServiceID: NSImage] = [:]

    public static func icon(for serviceID: ChatServiceID, size: NSSize = NSSize(width: 14, height: 14)) -> NSImage {
        let cacheKey = serviceID
        if let cached = iconCache[cacheKey] {
            return cached
        }

        let fileName = serviceID.iconFileName
        var loadedImage: NSImage?

        // 1. Thử load từ App Bundle Resources
        if let resourceURL = Bundle.main.resourceURL?.appendingPathComponent("chat_icons/\(fileName)"),
           FileManager.default.fileExists(atPath: resourceURL.path) {
            loadedImage = NSImage(contentsOf: resourceURL)
        } else if let bundleURL = Bundle.main.url(forResource: "chat_icons/\(fileName)", withExtension: nil) {
            loadedImage = NSImage(contentsOf: bundleURL)
        }

        // 2. Fallback cho dev / SPM runner
        if loadedImage == nil {
            let candidatePaths = [
                "/Users/vic/_Work/VXUtilities/vxchat/chat_icons/\(fileName)",
                "/Users/vic/_Work/VXUtilities/vxchat/Resources/chat_icons/\(fileName)"
            ]
            for path in candidatePaths {
                if FileManager.default.fileExists(atPath: path), let img = NSImage(contentsOfFile: path) {
                    loadedImage = img
                    break
                }
            }
        }

        let finalImage: NSImage
        if let img = loadedImage {
            img.size = size
            finalImage = img
        } else {
            let config = NSImage.SymbolConfiguration(pointSize: size.width - 2, weight: .medium)
            finalImage = NSImage(systemSymbolName: serviceID.iconSystemName, accessibilityDescription: serviceID.defaultLabel)?.withSymbolConfiguration(config) ?? NSImage()
        }

        iconCache[cacheKey] = finalImage
        return finalImage
    }
}
