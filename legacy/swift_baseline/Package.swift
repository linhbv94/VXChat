// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "VXChat",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(
            name: "VXChat",
            targets: ["VXChat"]
        ),
        .library(
            name: "VXChatCore",
            targets: ["VXChatCore"]
        )
    ],
    dependencies: [],
    targets: [
        .target(
            name: "VXChatCore",
            dependencies: [],
            path: "Sources/vxchat_core"
        ),
        .executableTarget(
            name: "VXChat",
            dependencies: ["VXChatCore"],
            path: "Sources/vxchat"
        ),
        .executableTarget(
            name: "VXChatWebTests",
            dependencies: ["VXChatCore"],
            path: "Tests/web_tests",
            exclude: ["messenger_fixture.html"]
        ),
        .executableTarget(
            name: "VXChatCoreTests",
            dependencies: ["VXChatCore"],
            path: "Tests/vxchat_tests"
        )
    ]
)
