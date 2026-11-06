import Foundation

// MARK: - Chat Service Identifier
public enum ChatServiceID: String, Codable, CaseIterable, Sendable {
    case messenger
    case zalo
    case slack
    case chatgpt

    public var defaultLabel: String {
        switch self {
        case .messenger: return "Messenger"
        case .zalo: return "Zalo"
        case .slack: return "Slack"
        case .chatgpt: return "ChatGPT"
        }
    }

    public var defaultEntryURL: URL {
        switch self {
        case .messenger:
            return URL(string: "https://www.facebook.com/messages/t")!
        case .zalo:
            return URL(string: "https://chat.zalo.me/")!
        case .slack:
            // Theo chỉ đạo của User: workspace mặc định là app.slack.com/client
            return URL(string: "https://app.slack.com/client")!
        case .chatgpt:
            return URL(string: "https://chatgpt.com/")!
        }
    }

    public var isAIMultiTab: Bool {
        return self == .chatgpt
    }

    public var iconSystemName: String {
        switch self {
        case .messenger:
            return "message.fill"
        case .zalo:
            return "bubble.left.and.bubble.right.fill"
        case .slack:
            return "number"
        case .chatgpt:
            return "sparkles"
        }
    }

    public var iconFileName: String {
        switch self {
        case .messenger:
            return "ivxchat_chaticon_messenger.svg"
        case .zalo:
            return "ivxchat_chaticon_zalo.svg"
        case .slack:
            return "ivxchat_chaticon_slack.svg"
        case .chatgpt:
            return "ivxchat_chaticon_chatgpt.svg"
        }
    }
}

// MARK: - User Agent Configuration
public enum WebUserAgent {
    /// Modern Desktop Chrome User Agent (v145+) trên macOS để vượt qua các bộ lọc unsupported / deprecate_block_old của Slack, đồng thời tương thích tối đa với Zalo và ChatGPT.
    public static let standardDesktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
}

// MARK: - Tab Item
public struct TabItem: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public let serviceID: ChatServiceID
    public var label: String
    public var entryURL: URL
    public var generation: Int

    public init(
        id: String = UUID().uuidString,
        serviceID: ChatServiceID,
        label: String? = nil,
        entryURL: URL? = nil,
        generation: Int = 1
    ) {
        self.id = id
        self.serviceID = serviceID
        self.label = label ?? serviceID.defaultLabel
        self.entryURL = entryURL ?? serviceID.defaultEntryURL
        self.generation = generation
    }
}

// MARK: - Tabs State
public struct TabsState: Codable, Equatable, Sendable {
    public var activeTabID: String?
    public var tabs: [TabItem]

    public init(activeTabID: String? = nil, tabs: [TabItem] = []) {
        self.activeTabID = activeTabID
        self.tabs = tabs
    }
}

// MARK: - Tabs State Manager
public final class TabsStateManager: @unchecked Sendable {
    public static let shared = TabsStateManager()

    private let fileManager = FileManager.default
    private let tabsStateURL: URL

    private init() {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let appDir = appSupport.appendingPathComponent("VXMessChat", isDirectory: true)
        try? fileManager.createDirectory(at: appDir, withIntermediateDirectories: true)
        self.tabsStateURL = appDir.appendingPathComponent("tabs_state.json")
    }

    public func load() -> TabsState {
        guard let data = try? Data(contentsOf: tabsStateURL),
              let state = try? JSONDecoder().decode(TabsState.self, from: data),
              !state.tabs.isEmpty else {
            // Mặc định khởi tạo 1 tab Messenger
            let defaultMessenger = TabItem(serviceID: .messenger)
            return TabsState(activeTabID: defaultMessenger.id, tabs: [defaultMessenger])
        }
        return state
    }

    public func save(_ state: TabsState) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        try? data.write(to: tabsStateURL, options: .atomic)
    }
}
