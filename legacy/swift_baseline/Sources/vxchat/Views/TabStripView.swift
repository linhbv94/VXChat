import Foundation
import AppKit
import VXChatCore

// MARK: - Tab Cell Drag Delegate
@MainActor
public protocol TabCellDragDelegate: AnyObject {
    func tabCellDidBeginDrag(_ cell: TabCellView)
    func tabCellDidDrag(_ cell: TabCellView, deltaX: CGFloat, currentWindowPoint: NSPoint)
    func tabCellDidEndDrag(_ cell: TabCellView)
}

// MARK: - Individual Tab Cell View
@MainActor
public final class TabCellView: NSView {
    public let tabItem: TabItem
    public var isActive: Bool = false {
        didSet { updateAppearance() }
    }

    public weak var dragDelegate: TabCellDragDelegate?
    public var onSelect: (() -> Void)?
    public var onClose: (() -> Void)?

    private let iconImageView = NSImageView()
    private let titleLabel = NSTextField(labelWithString: "")
    private let closeButton = NSButton()
    private let activeIndicator = NSBox()

    private var initialMouseDownPoint: NSPoint = .zero
    private var isDragging: Bool = false

    public init(tabItem: TabItem, isActive: Bool = false) {
        self.tabItem = tabItem
        self.isActive = isActive
        super.init(frame: .zero)
        setupViews()
        updateAppearance()
    }

    required public init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupViews() {
        wantsLayer = true
        layer?.cornerRadius = 6

        // 1. Service Icon (Load SVG thật từ chat_icons)
        iconImageView.translatesAutoresizingMaskIntoConstraints = false
        iconImageView.imageScaling = .scaleProportionallyUpOrDown
        iconImageView.image = ChatIconHelper.icon(for: tabItem.serviceID, size: NSSize(width: 14, height: 14))
        addSubview(iconImageView)

        // 2. Title Label
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.stringValue = tabItem.label
        titleLabel.font = NSFont.systemFont(ofSize: 11.5, weight: .medium)
        titleLabel.lineBreakMode = .byTruncatingTail
        addSubview(titleLabel)

        // 3. Close Button [x]
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.isBordered = false
        closeButton.wantsLayer = true
        closeButton.layer?.cornerRadius = 4
        closeButton.target = self
        closeButton.action = #selector(handleClose)
        if #available(macOS 11.0, *) {
            let config = NSImage.SymbolConfiguration(pointSize: 9, weight: .bold)
            closeButton.image = NSImage(systemSymbolName: "xmark", accessibilityDescription: "Đóng tab")?.withSymbolConfiguration(config)
            closeButton.contentTintColor = NSColor(calibratedRed: 148/255, green: 163/255, blue: 184/255, alpha: 0.8)
        }
        addSubview(closeButton)

        // 4. Active Indicator Line (Bottom Cyan line)
        activeIndicator.translatesAutoresizingMaskIntoConstraints = false
        activeIndicator.boxType = .custom
        activeIndicator.borderWidth = 0
        activeIndicator.fillColor = NSColor(calibratedRed: 34/255, green: 211/255, blue: 238/255, alpha: 1.0) // Cyan #22d3ee
        addSubview(activeIndicator)

        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 28),

            iconImageView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            iconImageView.centerYAnchor.constraint(equalTo: centerYAnchor),
            iconImageView.widthAnchor.constraint(equalToConstant: 14),
            iconImageView.heightAnchor.constraint(equalToConstant: 14),

            titleLabel.leadingAnchor.constraint(equalTo: iconImageView.trailingAnchor, constant: 6),
            titleLabel.centerYAnchor.constraint(equalTo: centerYAnchor),

            closeButton.leadingAnchor.constraint(equalTo: titleLabel.trailingAnchor, constant: 6),
            closeButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -6),
            closeButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            closeButton.widthAnchor.constraint(equalToConstant: 16),
            closeButton.heightAnchor.constraint(equalToConstant: 16),

            activeIndicator.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 4),
            activeIndicator.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -4),
            activeIndicator.bottomAnchor.constraint(equalTo: bottomAnchor),
            activeIndicator.heightAnchor.constraint(equalToConstant: 2)
        ])
    }

    private func updateAppearance() {
        if isActive {
            layer?.backgroundColor = NSColor(calibratedWhite: 1.0, alpha: 0.08).cgColor
            titleLabel.textColor = NSColor(calibratedRed: 248/255, green: 250/255, blue: 252/255, alpha: 1.0)
            activeIndicator.isHidden = false
        } else {
            layer?.backgroundColor = NSColor.clear.cgColor
            titleLabel.textColor = NSColor(calibratedRed: 148/255, green: 163/255, blue: 184/255, alpha: 0.9)
            activeIndicator.isHidden = true
        }
    }

    // MARK: - Mouse & Drag Handling
    override public func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if closeButton.frame.contains(point) {
            return
        }

        initialMouseDownPoint = event.locationInWindow
        isDragging = false
    }

    override public func mouseDragged(with event: NSEvent) {
        let currentPoint = event.locationInWindow
        let deltaX = currentPoint.x - initialMouseDownPoint.x

        if !isDragging {
            if abs(deltaX) > 4.0 {
                isDragging = true
                dragDelegate?.tabCellDidBeginDrag(self)
            }
        }

        if isDragging {
            dragDelegate?.tabCellDidDrag(self, deltaX: deltaX, currentWindowPoint: currentPoint)
        }
    }

    override public func mouseUp(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if closeButton.frame.contains(point) {
            return
        }

        if isDragging {
            isDragging = false
            dragDelegate?.tabCellDidEndDrag(self)
        } else {
            onSelect?()
        }
    }

    @objc private func handleClose() {
        onClose?()
    }
}

// MARK: - Native Tab Strip View (Standard 36pt Height)
@MainActor
public final class TabStripView: NSView {
    public var onSelectTab: ((String) -> Void)?
    public var onCloseTab: ((String) -> Void)?
    public var onAddService: ((ChatServiceID) -> Void)?
    public var onReorderTabs: (([TabItem]) -> Void)?

    private let scrollView = NSScrollView()
    private let tabsStackView = NSStackView()
    private let addButton = NSButton()
    private let bottomBorder = NSBox()

    private var currentTabs: [TabItem] = []
    private var activeTabID: String?

    // Drag state
    private var draggingCell: TabCellView?
    private var dragStartOriginX: CGFloat = 0

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
        layer?.backgroundColor = NSColor(calibratedRed: 24/255, green: 27/255, blue: 36/255, alpha: 1.0).cgColor // #181b24

        // 1. Bottom Divider (1pt)
        bottomBorder.boxType = .custom
        bottomBorder.borderWidth = 0
        bottomBorder.fillColor = NSColor(calibratedWhite: 1.0, alpha: 0.08)
        bottomBorder.translatesAutoresizingMaskIntoConstraints = false
        addSubview(bottomBorder)

        // 2. Add Service Button [+] (Chrome-style, đặt ngay sau tab cuối cùng)
        addButton.translatesAutoresizingMaskIntoConstraints = false
        addButton.isBordered = false
        addButton.wantsLayer = true
        addButton.layer?.cornerRadius = 6
        addButton.layer?.backgroundColor = NSColor(calibratedWhite: 1.0, alpha: 0.04).cgColor
        addButton.toolTip = "Thêm tab dịch vụ mới"
        addButton.target = self
        addButton.action = #selector(handleAddClicked)
        if #available(macOS 11.0, *) {
            let config = NSImage.SymbolConfiguration(pointSize: 11, weight: .bold)
            addButton.image = NSImage(systemSymbolName: "plus", accessibilityDescription: "Thêm dịch vụ")?.withSymbolConfiguration(config)
            addButton.contentTintColor = NSColor(calibratedRed: 148/255, green: 163/255, blue: 184/255, alpha: 1.0)
        }

        // 3. Scroll View for Tabs (trải rộng full chiều ngang)
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = false
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        addSubview(scrollView)

        // 4. Stack View containing Tab Cells + Add Button
        tabsStackView.orientation = .horizontal
        tabsStackView.alignment = .centerY
        tabsStackView.spacing = 4
        tabsStackView.edgeInsets = NSEdgeInsets(top: 0, left: 12, bottom: 0, right: 12)
        tabsStackView.translatesAutoresizingMaskIntoConstraints = false

        scrollView.documentView = tabsStackView

        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 36),

            bottomBorder.leadingAnchor.constraint(equalTo: leadingAnchor),
            bottomBorder.trailingAnchor.constraint(equalTo: trailingAnchor),
            bottomBorder.bottomAnchor.constraint(equalTo: bottomAnchor),
            bottomBorder.heightAnchor.constraint(equalToConstant: 1),

            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor),
            scrollView.topAnchor.constraint(equalTo: topAnchor),
            scrollView.bottomAnchor.constraint(equalTo: bottomBorder.topAnchor),

            tabsStackView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            tabsStackView.topAnchor.constraint(equalTo: scrollView.topAnchor),
            tabsStackView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),

            addButton.widthAnchor.constraint(equalToConstant: 26),
            addButton.heightAnchor.constraint(equalToConstant: 26)
        ])
    }

    public func updateTabs(tabs: [TabItem], activeTabID: String?) {
        self.currentTabs = tabs
        self.activeTabID = activeTabID

        // Xóa các subview cũ khỏi stack
        for view in tabsStackView.arrangedSubviews {
            tabsStackView.removeArrangedSubview(view)
            if view != addButton {
                view.removeFromSuperview()
            }
        }

        // 1. Thêm từng TabCellView
        for tab in tabs {
            let isCurrent = (tab.id == activeTabID)
            let cell = TabCellView(tabItem: tab, isActive: isCurrent)
            cell.dragDelegate = self
            cell.onSelect = { [weak self] in
                self?.onSelectTab?(tab.id)
            }
            cell.onClose = { [weak self] in
                self?.onCloseTab?(tab.id)
            }
            tabsStackView.addArrangedSubview(cell)
        }

        // 2. Thêm nút [+] vào ngay sau tab cuối cùng (giống Chrome)
        tabsStackView.addArrangedSubview(addButton)
    }

    @objc private func handleAddClicked() {
        let menu = NSMenu(title: "Add Service")

        // 1. Messenger (nếu chưa có)
        let hasMessenger = currentTabs.contains(where: { $0.serviceID == .messenger })
        let messengerItem = NSMenuItem(title: hasMessenger ? "Messenger (Đã mở)" : "Messenger (Facebook)", action: #selector(handleMenuSelectService(_:)), keyEquivalent: "")
        messengerItem.target = self
        messengerItem.representedObject = ChatServiceID.messenger
        messengerItem.image = ChatIconHelper.icon(for: .messenger, size: NSSize(width: 14, height: 14))
        menu.addItem(messengerItem)

        // 2. Zalo (nếu chưa có)
        let hasZalo = currentTabs.contains(where: { $0.serviceID == .zalo })
        let zaloItem = NSMenuItem(title: hasZalo ? "Zalo (Đã mở)" : "Zalo Chat (chat.zalo.me)", action: #selector(handleMenuSelectService(_:)), keyEquivalent: "")
        zaloItem.target = self
        zaloItem.representedObject = ChatServiceID.zalo
        zaloItem.image = ChatIconHelper.icon(for: .zalo, size: NSSize(width: 14, height: 14))
        menu.addItem(zaloItem)

        // 3. Slack (nếu chưa có)
        let hasSlack = currentTabs.contains(where: { $0.serviceID == .slack })
        let slackItem = NSMenuItem(title: hasSlack ? "Slack (Đã mở)" : "Slack (app.slack.com/client)", action: #selector(handleMenuSelectService(_:)), keyEquivalent: "")
        slackItem.target = self
        slackItem.representedObject = ChatServiceID.slack
        slackItem.image = ChatIconHelper.icon(for: .slack, size: NSSize(width: 14, height: 14))
        menu.addItem(slackItem)

        menu.addItem(NSMenuItem.separator())

        // 4. ChatGPT (cho phép mở nhiều tab)
        let chatgptItem = NSMenuItem(title: "ChatGPT (Mở thêm tab mới)", action: #selector(handleMenuSelectService(_:)), keyEquivalent: "")
        chatgptItem.target = self
        chatgptItem.representedObject = ChatServiceID.chatgpt
        chatgptItem.image = ChatIconHelper.icon(for: .chatgpt, size: NSSize(width: 14, height: 14))
        menu.addItem(chatgptItem)

        let point = NSPoint(x: addButton.bounds.minX, y: addButton.bounds.maxY + 4)
        menu.popUp(positioning: nil, at: point, in: addButton)
    }

    @objc private func handleMenuSelectService(_ sender: NSMenuItem) {
        guard let serviceID = sender.representedObject as? ChatServiceID else { return }
        onAddService?(serviceID)
    }
}

// MARK: - TabCellDragDelegate Implementation
extension TabStripView: TabCellDragDelegate {
    public func tabCellDidBeginDrag(_ cell: TabCellView) {
        draggingCell = cell
        dragStartOriginX = cell.frame.origin.x
        cell.layer?.zPosition = 100
    }

    public func tabCellDidDrag(_ cell: TabCellView, deltaX: CGFloat, currentWindowPoint: NSPoint) {
        guard draggingCell == cell else { return }

        // Di chuyển translation layer cho mượt mà
        cell.layer?.transform = CATransform3DMakeTranslation(deltaX, 0, 0)

        // Tìm vị trí tương ứng trong stack
        guard let currentIndex = currentTabs.firstIndex(where: { $0.id == cell.tabItem.id }) else { return }
        let currentMidX = cell.frame.midX + deltaX

        // Kéo sang phải: hoán đổi với cell kế bên phải
        if deltaX > 0 && currentIndex < currentTabs.count - 1 {
            let nextIndex = currentIndex + 1
            let nextCell = tabsStackView.arrangedSubviews[nextIndex]
            if currentMidX > nextCell.frame.midX {
                swapTabPositions(from: currentIndex, to: nextIndex, cell: cell)
            }
        }
        // Kéo sang trái: hoán đổi với cell kế bên trái
        else if deltaX < 0 && currentIndex > 0 {
            let prevIndex = currentIndex - 1
            let prevCell = tabsStackView.arrangedSubviews[prevIndex]
            if currentMidX < prevCell.frame.midX {
                swapTabPositions(from: currentIndex, to: prevIndex, cell: cell)
            }
        }
    }

    private func swapTabPositions(from fromIndex: Int, to toIndex: Int, cell: TabCellView) {
        currentTabs.swapAt(fromIndex, toIndex)

        // Cập nhật vị trí trong stack view với animation nhẹ
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.15
            tabsStackView.removeArrangedSubview(cell)
            tabsStackView.insertArrangedSubview(cell, at: toIndex)
            tabsStackView.layoutSubtreeIfNeeded()
        }
    }

    public func tabCellDidEndDrag(_ cell: TabCellView) {
        guard draggingCell == cell else { return }
        draggingCell = nil

        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.15
            cell.layer?.transform = CATransform3DIdentity
        }, completionHandler: { [weak self] in
            DispatchQueue.main.async {
                cell.layer?.zPosition = 0
                guard let self = self else { return }
                self.onReorderTabs?(self.currentTabs)
            }
        })
    }
}
