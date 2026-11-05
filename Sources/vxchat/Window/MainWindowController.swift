import Foundation
import AppKit
import VXChatCore

// MARK: - VXWindow with Exact Standard 32 Traffic Lights Alignment
public final class VXWindow: NSWindow {
    override public func layoutIfNeeded() {
        super.layoutIfNeeded()
        adjustTrafficLights()
    }

    public func adjustTrafficLights() {
        guard let closeBtn = standardWindowButton(.closeButton),
              let minBtn = standardWindowButton(.miniaturizeButton),
              let zoomBtn = standardWindowButton(.zoomButton),
              let superview = closeBtn.superview else { return }

        let yCenter: CGFloat = 15.5
        let btnSize: CGFloat = 14.0

        let yOrigin = superview.isFlipped ? (yCenter - (btnSize / 2)) : (superview.bounds.height - yCenter - (btnSize / 2))

        closeBtn.setFrameOrigin(NSPoint(x: 14 - (closeBtn.frame.width / 2), y: yOrigin))
        minBtn.setFrameOrigin(NSPoint(x: 34 - (minBtn.frame.width / 2), y: yOrigin))
        zoomBtn.setFrameOrigin(NSPoint(x: 54 - (zoomBtn.frame.width / 2), y: yOrigin))
    }
}

// MARK: - Custom Titlebar View (Standard 32pt matching titlebar_contract.json)
public final class TitlebarView: NSView {
    public var onOpenSettings: (() -> Void)?

    private let glyphImageView = NSImageView()
    private let titleLabel = NSTextField(labelWithString: "VXChat")
    private let settingsButton = NSButton()
    private let bottomBorder = NSBox()

    override public init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupViews()
    }

    required public init?(coder: NSCoder) {
        super.init(coder: coder)
        setupViews()
    }

    private func setupViews() {
        wantsLayer = true
        layer?.backgroundColor = NSColor(calibratedRed: 20/255, green: 24/255, blue: 33/255, alpha: 1.0).cgColor // #141821 (VX Standard Dark)

        // 1. Bottom border (1pt divider)
        bottomBorder.boxType = .custom
        bottomBorder.borderWidth = 0
        bottomBorder.fillColor = NSColor(calibratedWhite: 1.0, alpha: 0.08) // rgba(255,255,255,.08)
        bottomBorder.translatesAutoresizingMaskIntoConstraints = false
        addSubview(bottomBorder)

        // 2. Glyph SVG / Vector (x: 82, size: 16x16, center_y: 15.5)
        glyphImageView.translatesAutoresizingMaskIntoConstraints = false
        if #available(macOS 11.0, *) {
            let config = NSImage.SymbolConfiguration(pointSize: 13, weight: .semibold)
            glyphImageView.image = NSImage(systemSymbolName: "message.fill", accessibilityDescription: "VXChat Glyph")?.withSymbolConfiguration(config)
            glyphImageView.contentTintColor = NSColor(calibratedRed: 34/255, green: 211/255, blue: 238/255, alpha: 1.0) // #22d3ee (VX Standard Cyan)
        }
        addSubview(glyphImageView)

        // 3. App Name Label (x: 104, font_size: 12, font_weight: 600, center_y: 15.5)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.font = NSFont.systemFont(ofSize: 12, weight: .semibold)
        titleLabel.textColor = NSColor(calibratedRed: 248/255, green: 250/255, blue: 252/255, alpha: 1.0) // #f8fafc
        addSubview(titleLabel)

        // 4. Settings Button: icon-only gear in 28x28 box, radius 6, right inset 12pt
        settingsButton.translatesAutoresizingMaskIntoConstraints = false
        settingsButton.isBordered = false
        settingsButton.wantsLayer = true
        settingsButton.layer?.cornerRadius = 6
        settingsButton.layer?.backgroundColor = NSColor.clear.cgColor
        settingsButton.toolTip = "Cài đặt ứng dụng (⌘,)"
        settingsButton.target = self
        settingsButton.action = #selector(handleSettingsClicked)
        if #available(macOS 11.0, *) {
            let config = NSImage.SymbolConfiguration(pointSize: 14, weight: .regular)
            settingsButton.image = NSImage(systemSymbolName: "gearshape", accessibilityDescription: "Cài đặt")?.withSymbolConfiguration(config)
            settingsButton.contentTintColor = NSColor(calibratedRed: 148/255, green: 163/255, blue: 184/255, alpha: 1.0) // #94a3b8
        }
        addSubview(settingsButton)

        // Layout constraints
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 32),

            bottomBorder.leadingAnchor.constraint(equalTo: leadingAnchor),
            bottomBorder.trailingAnchor.constraint(equalTo: trailingAnchor),
            bottomBorder.bottomAnchor.constraint(equalTo: bottomAnchor),
            bottomBorder.heightAnchor.constraint(equalToConstant: 1),

            glyphImageView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 82),
            glyphImageView.centerYAnchor.constraint(equalTo: centerYAnchor),
            glyphImageView.widthAnchor.constraint(equalToConstant: 16),
            glyphImageView.heightAnchor.constraint(equalToConstant: 16),

            titleLabel.leadingAnchor.constraint(equalTo: glyphImageView.trailingAnchor, constant: 6),
            titleLabel.centerYAnchor.constraint(equalTo: centerYAnchor),

            settingsButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            settingsButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            settingsButton.widthAnchor.constraint(equalToConstant: 28),
            settingsButton.heightAnchor.constraint(equalToConstant: 28)
        ])
    }

    override public func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 {
            let pointInView = convert(event.locationInWindow, from: nil)
            if !settingsButton.frame.contains(pointInView) {
                window?.zoom(nil)
                return
            }
        }
        if let window = window {
            window.performDrag(with: event)
        }
    }

    @objc private func handleSettingsClicked() {
        onOpenSettings?()
    }
}

// MARK: - Main Window Controller
public final class MainWindowController: NSWindowController, NSWindowDelegate {
    public let webViewController = WebViewController()
    private let titlebarView = TitlebarView()

    public init() {
        let window = VXWindow(
            contentRect: NSRect(x: 100, y: 100, width: 1200, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.minSize = NSSize(width: 800, height: 600)
        window.title = "VXChat"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(calibratedRed: 20/255, green: 24/255, blue: 33/255, alpha: 1.0)
        window.setFrameAutosaveName("VXMessChatMainWindow") // Preserve the existing saved window frame.

        super.init(window: window)
        window.delegate = self

        setupContentLayout(window: window)
    }

    required public init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupContentLayout(window: NSWindow) {
        let rootContainer = NSView(frame: window.contentRect(forFrameRect: window.frame))
        rootContainer.wantsLayer = true
        rootContainer.layer?.backgroundColor = NSColor(calibratedRed: 20/255, green: 24/255, blue: 33/255, alpha: 1.0).cgColor
        window.contentView = rootContainer

        titlebarView.translatesAutoresizingMaskIntoConstraints = false
        titlebarView.onOpenSettings = { [weak self] in
            self?.handleOpenSettings()
        }

        let webView = webViewController.view
        webView.translatesAutoresizingMaskIntoConstraints = false

        rootContainer.addSubview(titlebarView)
        rootContainer.addSubview(webView)

        NSLayoutConstraint.activate([
            // Titlebar 32pt chuẩn VX
            titlebarView.topAnchor.constraint(equalTo: rootContainer.topAnchor),
            titlebarView.leadingAnchor.constraint(equalTo: rootContainer.leadingAnchor),
            titlebarView.trailingAnchor.constraint(equalTo: rootContainer.trailingAnchor),
            titlebarView.heightAnchor.constraint(equalToConstant: 32),

            // WKWebView nằm trực tiếp dưới Titlebar và neo cứng sàn cửa sổ (100% không bao giờ hở đáy)
            webView.topAnchor.constraint(equalTo: titlebarView.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: rootContainer.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: rootContainer.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: rootContainer.bottomAnchor)
        ])
    }

    public func setTopNavCrop(enabled: Bool) {
        // TopNav 56px được triệt tiêu 100% bằng CSS / DOM injection không phụ thuộc crop native
    }

    public func handleReload() {
        webViewController.reload()
    }

    public func handleHomeMess() {
        webViewController.loadMessenger()
    }

    public func handleOpenSettings() {
        PreferencesWindowController.shared.showWindow(nil)
        PreferencesWindowController.shared.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: - NSWindowDelegate (Close-to-Hide)
    public func windowShouldClose(_ sender: NSWindow) -> Bool {
        let prefs = PreferencesManager.shared.load()
        if prefs.closeToHide {
            sender.orderOut(nil)
            return false
        }
        return true
    }
}
