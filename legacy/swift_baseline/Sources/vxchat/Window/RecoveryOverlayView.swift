import Foundation
import AppKit

public final class RecoveryOverlayView: NSVisualEffectView {
    public var onRetry: (() -> Void)?

    private let messageLabel = NSTextField(labelWithString: "Phát hiện vòng lặp chuyển hướng từ Facebook.")
    private let detailLabel = NSTextField(labelWithString: "Hệ thống đã tạm dừng tự động điều hướng để bảo vệ ứng dụng.\nNhấn nút bên dưới để thử tải lại Messenger.")
    private let retryButton = NSButton(title: "Thử lại Messenger", target: nil, action: nil)

    override public init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupUI()
    }

    required public init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    private func setupUI() {
        material = .underWindowBackground
        blendingMode = .withinWindow
        state = .active

        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false

        let warningIcon = NSImageView()
        if #available(macOS 11.0, *) {
            warningIcon.image = NSImage(systemSymbolName: "exclamationmark.triangle.fill", accessibilityDescription: "Cảnh báo")
            warningIcon.contentTintColor = .systemOrange
        }
        warningIcon.translatesAutoresizingMaskIntoConstraints = false
        warningIcon.widthAnchor.constraint(equalToConstant: 48).isActive = true
        warningIcon.heightAnchor.constraint(equalToConstant: 48).isActive = true

        messageLabel.font = NSFont.boldSystemFont(ofSize: 16)
        messageLabel.textColor = .labelColor
        messageLabel.alignment = .center

        detailLabel.font = NSFont.systemFont(ofSize: 13)
        detailLabel.textColor = .secondaryLabelColor
        detailLabel.alignment = .center

        retryButton.bezelStyle = .rounded
        retryButton.controlSize = .large
        retryButton.keyEquivalent = "\r"
        retryButton.target = self
        retryButton.action = #selector(handleRetry)

        stack.addArrangedSubview(warningIcon)
        stack.addArrangedSubview(messageLabel)
        stack.addArrangedSubview(detailLabel)
        stack.addArrangedSubview(retryButton)

        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 400)
        ])
    }

    @objc private func handleRetry() {
        onRetry?()
    }
}
