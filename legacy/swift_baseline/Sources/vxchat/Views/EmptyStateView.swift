import Foundation
import AppKit
import VXChatCore

public final class EmptyStateView: NSView {
    public var onSelectService: ((ChatServiceID) -> Void)?

    private let containerStack = NSStackView()
    private let titleLabel = NSTextField(labelWithString: "Không có tab trò chuyện nào đang mở")
    private let subtitleLabel = NSTextField(labelWithString: "Chọn một dịch vụ bên dưới hoặc bấm nút [+] trên thanh tab để bắt đầu")
    private let buttonsStack = NSStackView()

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
        layer?.backgroundColor = NSColor(calibratedRed: 20/255, green: 24/255, blue: 33/255, alpha: 1.0).cgColor

        containerStack.orientation = .vertical
        containerStack.alignment = .centerX
        containerStack.spacing = 16
        containerStack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(containerStack)

        titleLabel.font = NSFont.systemFont(ofSize: 16, weight: .semibold)
        titleLabel.textColor = NSColor(calibratedRed: 248/255, green: 250/255, blue: 252/255, alpha: 1.0)
        containerStack.addArrangedSubview(titleLabel)

        subtitleLabel.font = NSFont.systemFont(ofSize: 13, weight: .regular)
        subtitleLabel.textColor = NSColor(calibratedRed: 148/255, green: 163/255, blue: 184/255, alpha: 1.0)
        containerStack.addArrangedSubview(subtitleLabel)

        buttonsStack.orientation = .horizontal
        buttonsStack.alignment = .centerY
        buttonsStack.spacing = 12
        containerStack.addArrangedSubview(buttonsStack)

        addServiceButton(title: "Messenger", serviceID: .messenger)
        addServiceButton(title: "Zalo", serviceID: .zalo)
        addServiceButton(title: "Slack", serviceID: .slack)
        addServiceButton(title: "ChatGPT", serviceID: .chatgpt)

        NSLayoutConstraint.activate([
            containerStack.centerXAnchor.constraint(equalTo: centerXAnchor),
            containerStack.centerYAnchor.constraint(equalTo: centerYAnchor)
        ])
    }

    private func addServiceButton(title: String, serviceID: ChatServiceID) {
        let btn = NSButton()
        btn.title = "  " + title
        btn.bezelStyle = .rounded
        btn.wantsLayer = true
        btn.target = self
        btn.action = #selector(handleButtonClicked(_:))
        btn.image = ChatIconHelper.icon(for: serviceID, size: NSSize(width: 15, height: 15))
        btn.imagePosition = .imageLeading
        btn.tag = serviceID.hashValue

        // Lưu mapping
        objc_setAssociatedObject(btn, "service_id", serviceID, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        buttonsStack.addArrangedSubview(btn)
    }

    @objc private func handleButtonClicked(_ sender: NSButton) {
        guard let serviceID = objc_getAssociatedObject(sender, "service_id") as? ChatServiceID else { return }
        onSelectService?(serviceID)
    }
}
