import Foundation
import AppKit
import VXChatCore

@MainActor
public final class AppDelegate: NSObject, NSApplicationDelegate {
    public var mainWindowController: MainWindowController?

    public func applicationDidFinishLaunching(_ notification: Notification) {
        // 1. Enable Keep-Alive to prevent WebKit freezing
        KeepAliveManager.shared.enableKeepAlive()

        // 2. Request Notification Authorization
        NotificationManager.shared.requestAuthorization { granted in
            if granted {
                print("[AppDelegate] Notification authorization granted.")
            }
        }

        // 3. Create Main Window Controller
        let mainWC = MainWindowController()
        self.mainWindowController = mainWC

        // 4. Wire notification deep linking
        NotificationManager.shared.onSelectThread = { [weak mainWC] threadId, threadPath in
            DispatchQueue.main.async {
                guard let window = mainWC?.window else { return }
                window.makeKeyAndOrderFront(nil)
                NSApp.activate(ignoringOtherApps: true)
                mainWC?.webViewController.navigateToThread(id: threadId, path: threadPath)
            }
        }

        // 5. Wire wake recovery
        KeepAliveManager.shared.onWake = { [weak mainWC] in
            DispatchQueue.main.async {
                print("[AppDelegate] System did wake. Checking connection...")
                mainWC?.webViewController.reload()
            }
        }

        // 6. Wire preferences callbacks
        PreferencesWindowController.shared.onPreferencesChanged = { [weak mainWC] in
            DispatchQueue.main.async {
                mainWC?.webViewController.reapplyScripts()
            }
        }

        PreferencesWindowController.shared.onLogoutRequested = { [weak mainWC] in
            DispatchQueue.main.async {
                mainWC?.webViewController.loadMessenger()
            }
        }

        // 7. Setup Application Menus
        setupMainMenu()

        // 8. Present window unless launched silently
        let isSilentLaunch = CommandLine.arguments.contains("--silent-launch")
        if !isSilentLaunch {
            mainWC.showWindow(nil)
            mainWC.window?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        } else {
            mainWC.window?.orderOut(nil)
        }
    }

    public func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            mainWindowController?.window?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
        return true
    }

    public func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }

    public func applicationWillTerminate(_ notification: Notification) {
        KeepAliveManager.shared.disableKeepAlive()
    }

    // MARK: - Menu Setup
    private func setupMainMenu() {
        let mainMenu = NSMenu()

        // 1. App Menu
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Về VXChat", action: #selector(handleAbout), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Cài đặt...", action: #selector(handlePreferences), keyEquivalent: ",")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Ẩn VXChat", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthersItem = NSMenuItem(title: "Ẩn các ứng dụng khác", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthersItem.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthersItem)
        appMenu.addItem(withTitle: "Hiện tất cả", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Thoát VXChat", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // 2. File Menu
        let fileMenuItem = NSMenuItem()
        let fileMenu = NSMenu(title: "Tệp")
        fileMenu.addItem(withTitle: "Đóng cửa sổ", action: #selector(handleCloseWindow), keyEquivalent: "w")
        fileMenu.addItem(withTitle: "Tải lại trang", action: #selector(handleReload), keyEquivalent: "r")
        fileMenuItem.submenu = fileMenu
        mainMenu.addItem(fileMenuItem)

        // 3. Edit Menu (Standard text editing shortcuts)
        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "Chỉnh sửa")
        editMenu.addItem(withTitle: "Hoàn tác", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Làm lại", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "Cắt", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Sao chép", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Dán", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Chọn tất cả", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        // 4. Window Menu
        let windowMenuItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Cửa sổ")
        windowMenu.addItem(withTitle: "Thu nhỏ", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Phóng to", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenu.addItem(NSMenuItem.separator())
        windowMenu.addItem(withTitle: "Đưa tất cả lên trước", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        windowMenuItem.submenu = windowMenu
        mainMenu.addItem(windowMenuItem)

        NSApp.mainMenu = mainMenu
    }

    @objc private func handleAbout() {
        let alert = NSAlert()
        alert.messageText = "VXChat"
        alert.informativeText = "Phiên bản 1.0.0\nTrình nhắn tin Facebook Messenger native siêu nhẹ cho macOS trong hệ sinh thái VXUtilities.\n\nTác giả: Bùi Việt Linh\nMã nguồn: https://github.com/linhbv94/VXChat"
        alert.alertStyle = .informational
        if let iconPath = Bundle.main.path(forResource: "AppIcon", ofType: "icns"), let img = NSImage(contentsOfFile: iconPath) {
            alert.icon = img
        }
        alert.addButton(withTitle: "Đóng")
        alert.runModal()
    }

    @objc private func handlePreferences() {
        mainWindowController?.handleOpenSettings()
    }

    @objc private func handleCloseWindow() {
        mainWindowController?.window?.performClose(nil)
    }

    @objc private func handleReload() {
        mainWindowController?.handleReload()
    }
}
