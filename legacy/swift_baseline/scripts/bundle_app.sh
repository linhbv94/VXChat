#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_DIR}"

APP_NAME="VXChat"
BUNDLE_ID="com.vxutilities.vxmesschat"
VERSION="${1:-1.0.0}"
if [ "$#" -gt 0 ]; then shift; fi
BUILD_DIR="${VXCHAT_BUILD_DIR:-${PROJECT_DIR}/build}"
APP_BUNDLE="${BUILD_DIR}/${APP_NAME}.app"
CONTENTS_DIR="${APP_BUNDLE}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"

SDK_VERSION="$(xcrun --sdk macosx --show-sdk-version)"
if [ "${SDK_VERSION}" != "27.0" ]; then
    echo "Expected macOS SDK 27.0; selected ${SDK_VERSION}" >&2
    exit 1
fi
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
# Swift 6.4 swiftbuild can stamp the deployment target as SDK in LC_BUILD_VERSION.
# Use the native SwiftPM build engine and pass the actual SDK explicitly.
BUILD_SCRATCH="${PROJECT_DIR}/.build/native_sdk27"

echo "==> Building ${APP_NAME} in Release mode via Swift Package Manager..."
swift build --build-system native --scratch-path "${BUILD_SCRATCH}" --sdk "${SDK_PATH}" -c release --product "${APP_NAME}" "$@"
# Ask the same build engine for the exact executable directory; never use stale symlinks.
BIN_DIR="$(swift build --build-system native --scratch-path "${BUILD_SCRATCH}" --sdk "${SDK_PATH}" -c release --show-bin-path "$@")"
for resource in clean_header.css chat_bubble.css dom_observer.js messenger_layout.js notification_observer.js settings.html settings_ui.css; do
    test -s "${PROJECT_DIR}/Resources/${resource}"
done

echo "==> Assembling ${APP_NAME}.app bundle structure..."
rm -rf "${APP_BUNDLE}"
mkdir -p "${MACOS_DIR}"
mkdir -p "${RESOURCES_DIR}"

# Copy binary
cp "${BIN_DIR}/${APP_NAME}" "${MACOS_DIR}/${APP_NAME}"
chmod +x "${MACOS_DIR}/${APP_NAME}"
ARTIFACT_SDK="$(xcrun vtool -show-build "${MACOS_DIR}/${APP_NAME}" | awk '$1 == "sdk" {print $2}')"
if [ "${ARTIFACT_SDK}" != "27.0" ]; then
    echo "Artifact SDK gate failed: ${ARTIFACT_SDK}" >&2
    exit 1
fi

# Copy resources
if [ -d "${PROJECT_DIR}/Resources" ]; then
    cp -R "${PROJECT_DIR}/Resources/"* "${RESOURCES_DIR}/"
    echo "==> Copied Resources to app bundle"
fi

# Copy icon if available
if [ -f "${PROJECT_DIR}/icon.icns" ]; then
    cp "${PROJECT_DIR}/icon.icns" "${RESOURCES_DIR}/AppIcon.icns"
    echo "==> Copied icon.icns to AppIcon.icns"
fi

# Generate Info.plist
cat <<EOF > "${CONTENTS_DIR}/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>LSUIElement</key>
    <false/>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSCameraUsageDescription</key>
    <string>VXChat cần quyền truy cập Camera để thực hiện cuộc gọi video trong Messenger.</string>
    <key>NSMicrophoneUsageDescription</key>
    <string>VXChat cần quyền truy cập Microphone để thực hiện cuộc gọi thoại trong Messenger.</string>
</dict>
</plist>
EOF

echo "==> Ad-hoc code signing ${APP_BUNDLE}..."
codesign --force --deep --sign - "${APP_BUNDLE}"
codesign -v "${APP_BUNDLE}"

echo "==> Successfully created ${APP_BUNDLE}!"
