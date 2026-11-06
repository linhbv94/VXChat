import Foundation
import VXChatCore

@main
struct VXChatCoreTests {
    static func main() async throws {
        print("==> [VXChatCoreTests] Starting suite execution...")

        try PreferencesTests.run()
        try BridgePayloadTests.run()
        NavigationPolicyHandlerTests.run()
        try TabModelsTests.run()

        print("==> [VXChatCoreTests] ALL TEST SUITES PASSED (100% OK)")
    }
}
