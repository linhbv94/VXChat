import Foundation
import AppKit
import WebKit
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
        bottomBorder.fillColor = NSColor(calibratedWhite: 1.0, alpha: 0.08)
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
        titleLabel.textColor = NSColor(calibratedRed: 248/255, green: 250/255, blue: 252/255, alpha: 1.0)
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
            settingsButton.contentTintColor = NSColor(calibratedRed: 148/255, green: 163/255, blue: 184/255, alpha: 1.0)
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

// MARK: - Tab Session Container
@MainActor
public final class TabSession {
    public var item: TabItem
    public let controller: NSViewController

    public var webView: WKWebView {
        if let mess = controller as? WebViewController {
            return mess.webView
        } else if let plain = controller as? PlainWebViewController {
            return plain.webView
        }
        return controller.view as! WKWebView
    }

    public init(item: TabItem, controller: NSViewController) {
        self.item = item
        self.controller = controller
    }
}

// MARK: - Main Window Controller
@MainActor
public final class MainWindowController: NSWindowController, NSWindowDelegate {
    private let titlebarView = TitlebarView()
    private let tabStripView = TabStripView()
    private let contentContainerView = NSView()
    private let emptyStateView = EmptyStateView()

    public private(set) var sessions: [TabSession] = []
    public private(set) var activeTabID: String?

    // Dedicated getter cho Messenger (dùng cho notifications & deep linking)
    public var messengerController: WebViewController? {
        return sessions.first(where: { $0.item.serviceID == .messenger })?.controller as? WebViewController
    }

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
        window.setFrameAutosaveName("VXMessChatMainWindow")

        super.init(window: window)
        window.delegate = self

        setupContentLayout(window: window)
        restoreSavedTabs()
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

        tabStripView.translatesAutoresizingMaskIntoConstraints = false
        tabStripView.onSelectTab = { [weak self] tabID in
            self?.selectTab(tabID: tabID)
        }
        tabStripView.onCloseTab = { [weak self] tabID in
            self?.closeTab(tabID: tabID)
        }
        tabStripView.onAddService = { [weak self] serviceID in
            self?.addTab(serviceID: serviceID)
        }
        tabStripView.onReorderTabs = { [weak self] newTabs in
            self?.handleReorderTabs(newTabs: newTabs)
        }

        contentContainerView.translatesAutoresizingMaskIntoConstraints = false
        contentContainerView.wantsLayer = true

        emptyStateView.translatesAutoresizingMaskIntoConstraints = false
        emptyStateView.isHidden = true
        emptyStateView.onSelectService = { [weak self] serviceID in
            self?.addTab(serviceID: serviceID)
        }

        rootContainer.addSubview(titlebarView)
        rootContainer.addSubview(tabStripView)
        rootContainer.addSubview(contentContainerView)
        contentContainerView.addSubview(emptyStateView)

        NSLayoutConstraint.activate([
            // 1. Titlebar 32pt
            titlebarView.topAnchor.constraint(equalTo: rootContainer.topAnchor),
            titlebarView.leadingAnchor.constraint(equalTo: rootContainer.leadingAnchor),
            titlebarView.trailingAnchor.constraint(equalTo: rootContainer.trailingAnchor),
            titlebarView.heightAnchor.constraint(equalToConstant: 32),

            // 2. Tab Strip 36pt ngay dưới Titlebar
            tabStripView.topAnchor.constraint(equalTo: titlebarView.bottomAnchor),
            tabStripView.leadingAnchor.constraint(equalTo: rootContainer.leadingAnchor),
            tabStripView.trailingAnchor.constraint(equalTo: rootContainer.trailingAnchor),
            tabStripView.heightAnchor.constraint(equalToConstant: 36),

            // 3. Content Container chiếm trọn phần còn lại xuống tận đáy sàn
            contentContainerView.topAnchor.constraint(equalTo: tabStripView.bottomAnchor),
            contentContainerView.leadingAnchor.constraint(equalTo: rootContainer.leadingAnchor),
            contentContainerView.trailingAnchor.constraint(equalTo: rootContainer.trailingAnchor),
            contentContainerView.bottomAnchor.constraint(equalTo: rootContainer.bottomAnchor),

            // 4. Empty State View nằm phủ kín content container
            emptyStateView.topAnchor.constraint(equalTo: contentContainerView.topAnchor),
            emptyStateView.leadingAnchor.constraint(equalTo: contentContainerView.leadingAnchor),
            emptyStateView.trailingAnchor.constraint(equalTo: contentContainerView.trailingAnchor),
            emptyStateView.bottomAnchor.constraint(equalTo: contentContainerView.bottomAnchor)
        ])
    }

    // MARK: - Tabs Management
    private func restoreSavedTabs() {
        let state = TabsStateManager.shared.load()
        if state.tabs.isEmpty {
            addTab(serviceID: .messenger)
            return
        }

        for tabItem in state.tabs {
            createSession(item: tabItem)
        }

        if let activeID = state.activeTabID, sessions.contains(where: { $0.item.id == activeID }) {
            selectTab(tabID: activeID)
        } else if let first = sessions.first {
            selectTab(tabID: first.item.id)
        } else {
            updateUIState()
        }
    }

    @discardableResult
    public func addTab(serviceID: ChatServiceID) -> String {
        // Non-AI (Messenger, Zalo, Slack): Mỗi loại chỉ mở tối đa 1 tab
        if !serviceID.isAIMultiTab {
            if let existing = sessions.first(where: { $0.item.serviceID == serviceID }) {
                selectTab(tabID: existing.item.id)
                return existing.item.id
            }
        }

        // Đặt tên nhãn hiển thị
        let label: String
        if serviceID.isAIMultiTab {
            let aiCount = sessions.filter({ $0.item.serviceID == serviceID }).count + 1
            label = aiCount == 1 ? "ChatGPT" : "ChatGPT \(aiCount)"
        } else {
            label = serviceID.defaultLabel
        }

        let tabItem = TabItem(serviceID: serviceID, label: label, entryURL: serviceID.defaultEntryURL)
        createSession(item: tabItem)
        selectTab(tabID: tabItem.id)
        return tabItem.id
    }

    private func createSession(item: TabItem) {
        let controller: NSViewController
        if item.serviceID == .messenger {
            controller = WebViewController()
        } else {
            controller = PlainWebViewController(serviceID: item.serviceID, entryURL: item.entryURL)
        }

        let session = TabSession(item: item, controller: controller)
        sessions.append(session)

        let subview = controller.view
        subview.translatesAutoresizingMaskIntoConstraints = false
        subview.isHidden = true
        contentContainerView.addSubview(subview)

        NSLayoutConstraint.activate([
            subview.topAnchor.constraint(equalTo: contentContainerView.topAnchor),
            subview.leadingAnchor.constraint(equalTo: contentContainerView.leadingAnchor),
            subview.trailingAnchor.constraint(equalTo: contentContainerView.trailingAnchor),
            subview.bottomAnchor.constraint(equalTo: contentContainerView.bottomAnchor)
        ])
    }

    public func selectTab(tabID: String) {
        guard sessions.contains(where: { $0.item.id == tabID }) else { return }
        activeTabID = tabID

        for s in sessions {
            s.controller.view.isHidden = (s.item.id != tabID)
        }

        updateUIState()
        persistTabsState()
    }

    public func closeTab(tabID: String) {
        guard let index = sessions.firstIndex(where: { $0.item.id == tabID }) else { return }
        let session = sessions.remove(at: index)
        session.controller.view.removeFromSuperview()

        // Nếu đóng tab đang active, chọn tab liền kề
        if activeTabID == tabID {
            if sessions.indices.contains(index) {
                activeTabID = sessions[index].item.id
            } else if !sessions.isEmpty {
                activeTabID = sessions[sessions.count - 1].item.id
            } else {
                activeTabID = nil
            }

            if let newActiveID = activeTabID {
                selectTab(tabID: newActiveID)
            }
        }

        updateUIState()
        persistTabsState()
    }

    public func handleReorderTabs(newTabs: [TabItem]) {
        var reorderedSessions: [TabSession] = []
        for item in newTabs {
            if let session = sessions.first(where: { $0.item.id == item.id }) {
                session.item = item
                reorderedSessions.append(session)
            }
        }
        self.sessions = reorderedSessions
        persistTabsState()
    }

    public func selectNextTab() {
        guard !sessions.isEmpty, let currentID = activeTabID,
              let currentIndex = sessions.firstIndex(where: { $0.item.id == currentID }) else { return }
        let nextIndex = (currentIndex + 1) % sessions.count
        selectTab(tabID: sessions[nextIndex].item.id)
    }

    public func selectPreviousTab() {
        guard !sessions.isEmpty, let currentID = activeTabID,
              let currentIndex = sessions.firstIndex(where: { $0.item.id == currentID }) else { return }
        let prevIndex = (currentIndex - 1 + sessions.count) % sessions.count
        selectTab(tabID: sessions[prevIndex].item.id)
    }

    public func closeCurrentTab() {
        if let currentID = activeTabID {
            closeTab(tabID: currentID)
        }
    }

    private func updateUIState() {
        tabStripView.updateTabs(tabs: sessions.map { $0.item }, activeTabID: activeTabID)
        emptyStateView.isHidden = !sessions.isEmpty
    }

    private func persistTabsState() {
        let state = TabsState(activeTabID: activeTabID, tabs: sessions.map { $0.item })
        TabsStateManager.shared.save(state)
    }

    // MARK: - Actions
    public func handleReload() {
        guard let currentID = activeTabID,
              let session = sessions.first(where: { $0.item.id == currentID }) else { return }
        if let mess = session.controller as? WebViewController {
            mess.reload()
        } else if let plain = session.controller as? PlainWebViewController {
            plain.reload()
        }
    }

    public func handleHomeMess() {
        if let messSession = sessions.first(where: { $0.item.serviceID == .messenger }) {
            selectTab(tabID: messSession.item.id)
            (messSession.controller as? WebViewController)?.loadMessenger()
        } else {
            addTab(serviceID: .messenger)
        }
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
