import Foundation
import VXChatCore

struct NavigationPolicyHandlerTests {
    static func run() {
        print("  --> Running NavigationPolicyHandlerTests...")
        testMessengerPathsAllowed()
        testMawProxyPageAllowed()
        testAuthPathsAllowed()
        testDisallowedNewsfeedRedirectsToMessenger()
        testExternalDomainsOpenInExternalBrowser()
        testInvalidSchemesBlocked()
        testLoopBreakerTriggersAfterMaxRedirects()
        print("  ✓ NavigationPolicyHandlerTests: PASS")
    }

    static func testMessengerPathsAllowed() {
        let handler = NavigationPolicyHandler()

        let rootMessenger = URL(string: "https://www.facebook.com/messages/t")!
        assertEqual(handler.evaluate(url: rootMessenger), .allow)

        let threadURL = URL(string: "https://www.facebook.com/messages/t/10000123456789")!
        assertEqual(handler.evaluate(url: threadURL), .allow)

        let e2eeURL = URL(string: "https://web.facebook.com/messages/e2ee/t/987654321")!
        assertEqual(handler.evaluate(url: e2eeURL), .allow)
    }

    static func testMawProxyPageAllowed() {
        let handler = NavigationPolicyHandler()
        let proxyURL = URL(string: "https://www.fbsbx.com/maw_proxy_page/?__cci=FQAREiIVABn1nQEC5ALSAvoCJC6KAz5ARkhKTE5QVFhcXmBiZGhqbHJ0eHqAAYIBhAGG")!
        assertEqual(handler.evaluate(url: proxyURL), .allow)
    }

    static func testAuthPathsAllowed() {
        let handler = NavigationPolicyHandler()

        let loginURL = URL(string: "https://www.facebook.com/login.php?next=messages")!
        assertEqual(handler.evaluate(url: loginURL), .allow)

        let checkpointURL = URL(string: "https://www.facebook.com/checkpoint/?next=https%3A%2F%2Fwww.facebook.com%2Fmessages%2Ft")!
        assertEqual(handler.evaluate(url: checkpointURL), .allow)

        let twoFactorURL = URL(string: "https://www.facebook.com/two_step_verification/two_factor")!
        assertEqual(handler.evaluate(url: twoFactorURL), .allow)
    }

    static func testDisallowedNewsfeedRedirectsToMessenger() {
        let handler = NavigationPolicyHandler()

        let homeURL = URL(string: "https://www.facebook.com/")!
        let decision1 = handler.evaluate(url: homeURL)
        if case .redirectToMessenger(let target) = decision1 {
            assertEqual(target.absoluteString, "https://www.facebook.com/messages/t")
        } else {
            fail("Expected .redirectToMessenger, got \(decision1)")
        }

        let homePhp = URL(string: "https://www.facebook.com/home.php")!
        let decision2 = handler.evaluate(url: homePhp)
        if case .redirectToMessenger(let target) = decision2 {
            assertEqual(target.absoluteString, "https://www.facebook.com/messages/t")
        } else {
            fail("Expected .redirectToMessenger, got \(decision2)")
        }

        let watchURL = URL(string: "https://www.facebook.com/watch")!
        let decision3 = handler.evaluate(url: watchURL)
        if case .redirectToMessenger(let target) = decision3 {
            assertEqual(target.absoluteString, "https://www.facebook.com/messages/t")
        } else {
            fail("Expected .redirectToMessenger, got \(decision3)")
        }
    }

    static func testExternalDomainsOpenInExternalBrowser() {
        let handler = NavigationPolicyHandler()

        let youtubeURL = URL(string: "https://www.youtube.com/watch?v=dQw4w9WgXcQ")!
        assertEqual(handler.evaluate(url: youtubeURL), .openExternal(youtubeURL))

        let githubURL = URL(string: "https://github.com/facebook/react")!
        assertEqual(handler.evaluate(url: githubURL), .openExternal(githubURL))

        // Profile link should open externally
        let profileURL = URL(string: "https://www.facebook.com/profile.php?id=1000")!
        assertEqual(handler.evaluate(url: profileURL), .openExternal(profileURL))
    }

    static func testInvalidSchemesBlocked() {
        let handler = NavigationPolicyHandler()

        let fileURL = URL(string: "file:///etc/passwd")!
        assertEqual(handler.evaluate(url: fileURL), .block)

        let jsURL = URL(string: "javascript:alert(1)")!
        assertEqual(handler.evaluate(url: jsURL), .block)
    }

    static func testLoopBreakerTriggersAfterMaxRedirects() {
        let handler = NavigationPolicyHandler(maxRedirectCount: 3, windowSeconds: 5.0)
        let homeURL = URL(string: "https://www.facebook.com/")!

        // Redirect 1, 2, 3 should redirect
        _ = handler.evaluate(url: homeURL)
        _ = handler.evaluate(url: homeURL)
        _ = handler.evaluate(url: homeURL)

        // Redirect 4 should trigger recovery
        let decision = handler.evaluate(url: homeURL)
        if case .triggerRecovery = decision {
            // Expected
        } else {
            fail("Expected .triggerRecovery, got \(decision)")
        }

        // After reset, redirects work again
        handler.resetLoopCounter()
        let resetDecision = handler.evaluate(url: homeURL)
        if case .redirectToMessenger = resetDecision {
            // Expected
        } else {
            fail("Expected .redirectToMessenger after reset, got \(resetDecision)")
        }
    }
}
