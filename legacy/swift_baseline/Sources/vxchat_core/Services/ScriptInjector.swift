import Foundation
import WebKit

public final class ScriptInjector: @unchecked Sendable {
    public static let shared = ScriptInjector()

    private init() {}

    public func makeCleanHeaderCSS() -> String {
        if let path = Bundle.main.path(forResource: "clean_header", ofType: "css"),
           let content = try? String(contentsOfFile: path, encoding: .utf8) {
            return content
        }
        return ""
    }

    public func makeChatBubbleCSS() -> String {
        resource("chat_bubble", extension: "css")
    }

    private func resource(_ name: String, extension ext: String) -> String {
        guard let path = Bundle.main.path(forResource: name, ofType: ext),
              let content = try? String(contentsOfFile: path, encoding: .utf8) else {
            print("[ScriptInjector] Missing required resource: \(name).\(ext)")
            return ""
        }
        return content
    }

    public func makeDOMObserverJS() -> String {
        if let path = Bundle.main.path(forResource: "dom_observer", ofType: "js"),
           let content = try? String(contentsOfFile: path, encoding: .utf8) {
            return content
        }
        return "// dom_observer fallback"
    }

    public func makeCSSInjectionScript(css: String, styleID: String) -> String {
        let payload: [String: String] = [
            "style_id": styleID,
            "css": css
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            return ""
        }

        return """
        (function() {
            if (window.top !== window) return;
            var payload = \(json);
            function installStyle() {
                var host = document.head || document.documentElement;
                if (!host) return;
                var style = document.getElementById(payload.style_id);
                if (!style) {
                    style = document.createElement('style');
                    style.id = payload.style_id;
                    style.type = 'text/css';
                    host.appendChild(style);
                }
                if (style.textContent !== payload.css) {
                    style.textContent = payload.css;
                }
            }
            installStyle();
            if (!document.head) {
                document.addEventListener('DOMContentLoaded', installStyle, { once: true });
            }
        })();
        """
    }

    @MainActor
    public func makeUserScripts(preferences: Preferences) -> [WKUserScript] {
        var scripts: [WKUserScript] = []

        let headerCSS = makeCleanHeaderCSS().trimmingCharacters(in: .whitespacesAndNewlines)
        if !headerCSS.isEmpty && preferences.autoCleanHeader {
            let js = makeCSSInjectionScript(css: headerCSS, styleID: "vx_clean_header_style")
            scripts.append(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }

        let bubbleCSS = makeChatBubbleCSS().trimmingCharacters(in: .whitespacesAndNewlines)
        if !bubbleCSS.isEmpty {
            let js = makeCSSInjectionScript(css: bubbleCSS, styleID: "vx_chat_bubble_style")
            scripts.append(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }

        let observerJS = makeDOMObserverJS()
        scripts.append(WKUserScript(source: observerJS, injectionTime: .atDocumentEnd, forMainFrameOnly: true))

        for name in ["messenger_layout", "notification_observer"] {
            let source = resource(name, extension: "js")
            scripts.append(WKUserScript(source: source, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        return scripts
    }
}
