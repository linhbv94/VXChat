import Foundation
import VXChatCore

enum TabModelsTests {
    static func run() throws {
        print("  --> Running TabModelsTests...")

        // 1. Test Service IDs & Entry URLs
        assert(ChatServiceID.messenger.defaultEntryURL.absoluteString == "https://www.facebook.com/messages/t", "Messenger entry URL mismatch")
        assert(ChatServiceID.zalo.defaultEntryURL.absoluteString == "https://chat.zalo.me/", "Zalo entry URL mismatch")
        assert(ChatServiceID.slack.defaultEntryURL.absoluteString == "https://app.slack.com/client", "Slack entry URL must be app.slack.com/client")
        assert(ChatServiceID.chatgpt.defaultEntryURL.absoluteString == "https://chatgpt.com/", "ChatGPT entry URL mismatch")

        // 2. Test Multi-tab Cardinality
        assert(ChatServiceID.messenger.isAIMultiTab == false, "Messenger must be single tab")
        assert(ChatServiceID.zalo.isAIMultiTab == false, "Zalo must be single tab")
        assert(ChatServiceID.slack.isAIMultiTab == false, "Slack must be single tab")
        assert(ChatServiceID.chatgpt.isAIMultiTab == true, "ChatGPT must allow multiple tabs")

        // 3. Test TabItem initialization & Encoding
        let tab1 = TabItem(serviceID: .messenger)
        assert(!tab1.id.isEmpty, "TabItem ID must not be empty")
        assert(tab1.label == "Messenger", "Default label must be Messenger")
        assert(tab1.generation == 1, "Default generation must be 1")

        let tab2 = TabItem(serviceID: .chatgpt, label: "ChatGPT 2")
        assert(tab2.label == "ChatGPT 2", "Custom label must match")

        // 4. Test TabsState JSON Serialization
        let state = TabsState(activeTabID: tab1.id, tabs: [tab1, tab2])
        let encoder = JSONEncoder()
        let data = try encoder.encode(state)
        assert(!data.isEmpty, "TabsState JSON data must not be empty")

        let decoder = JSONDecoder()
        let decodedState = try decoder.decode(TabsState.self, from: data)
        assert(decodedState.activeTabID == tab1.id, "Decoded activeTabID mismatch")
        assert(decodedState.tabs.count == 2, "Decoded tabs count must be 2")
        assert(decodedState.tabs[0].serviceID == .messenger, "First tab must be Messenger")
        assert(decodedState.tabs[1].serviceID == .chatgpt, "Second tab must be ChatGPT")
        assert(decodedState.tabs[1].label == "ChatGPT 2", "Second tab label mismatch")

        // 5. Test WebUserAgent (Chrome 145+ for Slack 2026 compatibility)
        assert(WebUserAgent.standardDesktop.contains("Chrome/"), "WebUserAgent must contain Chrome token")
        assert(WebUserAgent.standardDesktop.contains("Safari/"), "WebUserAgent must contain Safari token")

        // 6. Test ChatServiceID Icon File Names
        for service in ChatServiceID.allCases {
            assert(service.iconFileName.hasSuffix(".svg"), "\(service) iconFileName must end with .svg")
            assert(service.iconFileName.hasPrefix("ivxchat_chaticon_"), "\(service) iconFileName must have prefix ivxchat_chaticon_")
        }

        print("  ✓ TabModelsTests: PASS")
    }
}
