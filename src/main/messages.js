'use strict';
const COPY = {
  vi: {
    cancel: 'Hủy', allow: 'Cho phép', deny: 'Từ chối', closeTab: 'Đóng tab', open: 'Mở',
    permission: 'Cho phép quyền này cho website?', microphone: 'Microphone', camera: 'Camera', notifications: 'Thông báo', fullscreen: 'Toàn màn hình', clipboard: 'Clipboard', speaker: 'Thiết bị âm thanh',
    closeBusy: 'Đóng tab có thể ngắt cuộc gọi, cửa sổ đăng nhập hoặc quá trình tải file.',
    external: 'Mở liên kết này trong trình duyệt?', source: 'Chọn nguồn chia sẻ', screen: 'Màn hình', window: 'Cửa sổ',
    operationFailed: 'Không thực hiện được thao tác. Nội dung và phiên đăng nhập đã được giữ nguyên.',
    newTab: 'Thêm tab', nextTab: 'Tab tiếp', previousTab: 'Tab trước', reload: 'Tải lại', home: 'Quay lại trang chat', settings: 'Cài đặt…', downloads: 'Tệp đã tải',
    about: 'Giới thiệu VXChat', services: 'Dịch vụ', hide: 'Ẩn VXChat', hideOthers: 'Ẩn ứng dụng khác', showAll: 'Hiện tất cả', quit: 'Thoát VXChat',
    file: 'Tệp', edit: 'Chỉnh sửa', undo: 'Hoàn tác', redo: 'Làm lại', cut: 'Cắt', copy: 'Sao chép', paste: 'Dán', selectAll: 'Chọn tất cả',
    recovery: 'Cấu hình cần phục hồi', recoveryDetail: 'Giữ nguyên và thoát, hoặc lưu bản sao cấu hình hiện tại rồi tạo cấu hình mới. Dữ liệu đăng nhập của website không bị xóa.', keepAndQuit: 'Giữ nguyên và thoát', backupAndReset: 'Sao lưu và tạo mới',
    startupFailed: 'Không khởi tạo được ứng dụng. Không có dữ liệu đăng nhập nào bị xóa.', updateUnavailable: 'Bản dev chưa có cập nhật tự động.',
    blockedFile: 'Hãy kiểm tra tệp này trong thư mục tải xuống trước khi mở.',
  },
  en: {
    cancel: 'Cancel', allow: 'Allow', deny: 'Deny', closeTab: 'Close tab', open: 'Open',
    permission: 'Allow this website permission?', microphone: 'Microphone', camera: 'Camera', notifications: 'Notifications', fullscreen: 'Full screen', clipboard: 'Clipboard', speaker: 'Audio output device',
    closeBusy: 'Closing this tab may interrupt a call, a sign-in window or a download.',
    external: 'Open this link in your browser?', source: 'Choose a sharing source', screen: 'Screen', window: 'Window',
    operationFailed: 'The operation could not be completed. Your content and sign-in data were preserved.',
    newTab: 'New tab', nextTab: 'Next tab', previousTab: 'Previous tab', reload: 'Reload', home: 'Return to chat', settings: 'Settings…', downloads: 'Downloads',
    about: 'About VXChat', services: 'Services', hide: 'Hide VXChat', hideOthers: 'Hide Others', showAll: 'Show All', quit: 'Quit VXChat',
    file: 'File', edit: 'Edit', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All',
    recovery: 'Configuration needs recovery', recoveryDetail: 'Keep the original and quit, or back up the current configuration and create a new one. Website sign-in data will not be deleted.', keepAndQuit: 'Keep and quit', backupAndReset: 'Back up and reset',
    startupFailed: 'Application startup failed. No website sign-in data was deleted.', updateUnavailable: 'Automatic updates are unavailable in this development build.',
    blockedFile: 'Review this file in the download folder before opening it.',
  }
};
function text(language, key) { return COPY[language]?.[key] || COPY.vi[key] || key; }
module.exports = { text, COPY };
