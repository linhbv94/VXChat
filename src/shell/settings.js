'use strict';
let currentTheme = 'system';
let currentLang = 'vi';
let savedWorkspace = null;
let permissionEntries = [];
let browserPreferences = { zoom_levels:{}, download_directory:null, ask_download_location:true };

function applyTheme(theme) {
  currentTheme = theme;


  document.body.className = '';
  const root = document.getElementById('settings-root');
  if (root) root.removeAttribute('data-vx-settings-theme');

  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('dark', isDark);
  } else if (theme === 'dark') {
    document.body.classList.add('dark');
  } else if (theme === 'black') {
    document.body.classList.add('dark');
    if (root) root.setAttribute('data-vx-settings-theme', 'black');
  }

  renderCommon();
}
function applyLang(lang) {
  currentLang = lang; document.documentElement.lang = lang; renderCommon(); businessLabels();
}
let metadata = null;
function renderCommon() {
  const UI = window.VXSettingsUI; const c = UI.copy(currentLang); const en = currentLang === 'en';
  const active = document.activeElement; const focusName = active?.name; const focusValue = active?.value;
  document.getElementById('tab-nav-general').textContent = c.general;
  document.getElementById('tab-nav-updates').textContent = c.updates;
  document.getElementById('tab-nav-about').textContent = c.about;
  document.getElementById('tab-nav-support').textContent = c.support;
  document.getElementById('btn-reset-text').textContent = c.reset; document.getElementById('btn-close-text').textContent = c.close;
  document.getElementById('panel-general').innerHTML = UI.general({ language: currentLang, theme: currentTheme, themes: ['system', 'dark', 'light', 'black'] });
  const note = document.createElement('p'); note.textContent = en ? 'Reset restores theme, zoom, download preferences and the optional Slack URL. Language, site permissions and sign-in sessions are kept.' : 'Khôi phục theme, zoom, tùy chọn tải xuống và link Slack. Giữ ngôn ngữ, quyền website và phiên đăng nhập.'; document.getElementById('panel-general').append(note);
  document.querySelectorAll('input[name="setting-theme"]').forEach(radio => { radio.onchange = () => { if (radio.checked) void command({ action: 'preferences_update', patch: { theme: radio.value } }); }; });
  document.querySelectorAll('input[name="setting-lang"]').forEach(radio => { radio.onchange = () => { if (radio.checked) void command({ action: 'preferences_update', patch: { language: radio.value } }); }; });
  if (focusName) [...document.querySelectorAll('input')].find(el => el.name === focusName && el.value === focusValue)?.focus();
  const description = en ? 'Messaging services and AI conversations in one window. Multiple ChatGPT tabs share one sign-in session.' : 'Gom dịch vụ nhắn tin và hội thoại AI trong một cửa sổ. Nhiều tab ChatGPT chia sẻ phiên đăng nhập.';
  document.getElementById('panel-about').innerHTML = UI.about({ language: currentLang, appName: 'VXChat', appVersion: metadata?.version || '…', tagline: description, description, repository: metadata?.repository || '' });
  const tech = document.createElement('p'); if (metadata) tech.textContent = `Electron ${metadata.electron} • Chromium ${metadata.chromium} • Node.js ${metadata.node}`; document.getElementById('panel-about').append(tech);
  document.getElementById('panel-about').querySelector('a')?.addEventListener('click', event => { event.preventDefault(); void command({ action: 'repository_open' }); });
  document.getElementById('panel-support').innerHTML = UI.support({ language: currentLang, qrSource: 'qr.png' });
  const image = document.getElementById('panel-support').querySelector('img'); image.addEventListener('error', () => { image.hidden = true; const label = document.createElement('p'); label.textContent = c.qrMissing; image.after(label); }, { once: true });
  document.getElementById('update-banner-title').textContent = `VXChat v${metadata?.version || '…'}`;
  document.getElementById('update-banner-desc').textContent = metadata?.updater ? (en ? 'Signed stable updates from GitHub Releases.' : 'Bản cập nhật stable đã ký từ GitHub Releases.') : (en ? 'Automatic updates are unavailable in this development build.' : 'Bản phát triển chưa có cập nhật tự động.');
  document.getElementById('update-status-title').textContent = en ? 'Release status' : 'Trạng thái phát hành';
  document.getElementById('update-status-text').textContent = en ? 'Updates keep website sign-in data. The app restarts only after you choose Update & restart.' : 'Cập nhật giữ dữ liệu đăng nhập website. App chỉ khởi động lại sau khi bạn chọn Cập nhật & khởi động lại.';
}

// Tab navigation
document.querySelectorAll('.vx_settings_tab').forEach(tabBtn => {
  tabBtn.onclick = () => {
    const tabName = tabBtn.dataset.tab;
    document.querySelectorAll('.vx_settings_tab').forEach(b => b.classList.remove('is_active'));
    tabBtn.classList.add('is_active');

    document.querySelectorAll('main.vx_settings_body > section').forEach(sec => {
      sec.classList.add('is-hidden');
    });
    const target = document.getElementById(`panel-${tabName}`);
    if (target) target.classList.remove('is-hidden');
  };
});

// Close button
document.getElementById('btn-close').onclick = () => void command({ action: 'window_close' });

// Reset defaults: restores system theme, preserves current language per ST-08
document.getElementById('btn-reset').onclick = () => {
  void command({ action: 'preferences_reset' });
};

// Keyboard escape to close
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    void command({ action: 'window_close' });
  }
});

async function command(value) {
  const status = document.getElementById('settings-status');
  try {
    const result = await window.vxchat.command(value);
    if (!result.ok) throw new Error(result.error);
    status.textContent = '';
    if (result.preferences) applyPreferences(result.preferences);
    if (result.permissions) { permissionEntries = result.permissions; renderPermissions(); }
    return true;
  } catch (error) {
    status.textContent = error.message === 'invalid_workspace_url' ? (currentLang === 'en' ? 'Use a Slack workspace URL or app.slack.com/client/T… without query parameters.' : 'Dùng link workspace Slack hoặc app.slack.com/client/T… không có query.') : (currentLang === 'en' ? 'Could not save or complete the operation.' : 'Không lưu hoặc thực hiện được thao tác.');
    // Restore persisted radio choices when saving failed.
    applyTheme(currentTheme); document.querySelectorAll('input[name="setting-lang"]').forEach(r => { r.checked = r.value === currentLang; });
    return false;
  }
}
function applyPreferences(value) {
  browserPreferences = value;
  applyTheme(value.theme); applyLang(value.language); savedWorkspace = value.slack_workspace_url;
  const input = document.getElementById('workspace-url'); if (document.activeElement !== input) input.value = savedWorkspace || '';
}
function renderBrowserPreferences() {
  const root = document.getElementById('browser-controls'); if (!root) return;
  const en = currentLang === 'en'; root.replaceChildren();
  const heading = document.createElement('h3'); heading.className = 'vx_settings_heading'; heading.textContent = en ? 'Web content & downloads' : 'Nội dung web & tải xuống'; root.append(heading);
  for (const [service,label] of [['messenger','Messenger'],['zalo','Zalo'],['slack','Slack'],['chatgpt','ChatGPT'],['gmail','Gmail'],['gemini','Gemini'],['meet','Google Meet'],['telegram','Telegram'],['whatsapp','WhatsApp'],['discord','Discord']]) {
    const row = document.createElement('label'); row.className = 'browser-preference-row'; row.textContent = `${label} — Zoom`;
    const select = document.createElement('select'); select.id = `zoom-${service}`;
    for (const value of [0.5,0.67,0.8,0.9,1,1.1,1.25,1.5,1.75,2]) { const option = document.createElement('option'); option.value = value; option.textContent = `${Math.round(value * 100)}%`; select.append(option); }
    select.value = browserPreferences.zoom_levels?.[`default_${service}`] || 1;
    select.onchange = () => command({ action:'zoom_update',instance_id:`default_${service}`,factor:Number(select.value) }); row.append(select); root.append(row);
  }
  const note = document.createElement('p'); note.textContent = en ? 'Zoom applies to this service, including its AI tabs. App controls keep their size.' : 'Zoom áp dụng riêng dịch vụ, gồm các tab AI cùng dịch vụ. Nút điều khiển app giữ nguyên kích thước.'; root.append(note);
  const folder = document.createElement('p'); folder.id = 'download-directory'; folder.textContent = `${en ? 'Download folder' : 'Thư mục tải xuống'}: ${browserPreferences.download_directory || (en ? 'System Downloads' : 'Downloads của hệ thống')}`; root.append(folder);
  const choose = document.createElement('button'); choose.type = 'button'; choose.id = 'download-directory-choose'; choose.textContent = en ? 'Choose folder…' : 'Chọn thư mục…'; choose.onclick = () => command({ action:'download_directory_choose' }); root.append(choose);
  const ask = document.createElement('label'); ask.className = 'browser-preference-row'; const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = 'ask-download-location'; checkbox.checked = browserPreferences.ask_download_location !== false; checkbox.onchange = () => command({ action:'preferences_update',patch:{ ask_download_location:checkbox.checked } }); ask.append(checkbox,document.createTextNode(en ? 'Ask where to save each file' : 'Hỏi nơi lưu mỗi tệp')); root.append(ask);
}
function businessLabels() {
  renderBrowserPreferences();
  const en = currentLang === 'en';
  const labels = {
    'tab-nav-services': en ? 'Services' : 'Dịch vụ',
    'tab-nav-shortcuts': en ? 'Shortcuts' : 'Phím tắt',
    'workspace-label': en ? 'Workspace URL (optional)' : 'Link workspace (tùy chọn)',
    'workspace-hint': en ? 'Leave empty to resume the last workspace automatically. An optional workspace/client URL overrides the startup destination.' : 'Để trống để tự mở lại workspace gần nhất. Link workspace/client tùy chọn sẽ ghi đè điểm mở ban đầu.',
    'workspace-save': en ? 'Save' : 'Lưu',
    'workspace-open': en ? 'Open Slack' : 'Mở Slack',
    'permissions-title': en ? 'Website permissions' : 'Quyền website',
    'permissions-hint': en ? 'Revocation applies to new requests. End active calls/sharing before reloading.' : 'Thu hồi áp dụng cho yêu cầu mới. Đóng cuộc gọi/chia sẻ đang chạy trước khi tải lại.',
    'accounts-title': en ? 'Accounts & Sign out' : 'Tài khoản & Đăng xuất',
    'accounts-desc': en ? 'Each service maintains an independent session inside a sandboxed partition:' : 'Mỗi dịch vụ duy trì phiên đăng nhập riêng biệt trong vùng lưu trữ an toàn:'
  };
  for (const [id, value] of Object.entries(labels)) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  const itemMessenger = document.getElementById('accounts-item-messenger');
  if (itemMessenger) {
    itemMessenger.innerHTML = en
      ? '<strong>Messenger:</strong> Use the "Open full Facebook" button on the titlebar to manage or log out your account on web Facebook.'
      : '<strong>Messenger:</strong> Dùng nút "Mở Facebook đầy đủ" trên thanh tiêu đề để quản lý hoặc đăng xuất tài khoản trên Facebook web.';
  }
  const itemWeb = document.getElementById('accounts-item-web');
  if (itemWeb) {
    itemWeb.innerHTML = en
      ? '<strong>Slack / ChatGPT / Zalo / Gmail / Gemini / Meet:</strong> Log out or switch workspaces/accounts directly through the profile/account menu inside each web service. Gmail, Gemini, and Google Meet share one Google sign-in session.'
      : '<strong>Slack / ChatGPT / Zalo / Gmail / Gemini / Meet:</strong> Đăng xuất hoặc chuyển workspace/tài khoản trực tiếp qua menu cá nhân trong giao diện của từng dịch vụ. Gmail, Gemini và Google Meet dùng chung một phiên đăng nhập Google.';
  }
  renderPermissions();
  renderShortcuts();
}
function renderShortcuts() {
  const en = currentLang === 'en';
  const isMac = metadata?.platform === 'darwin' || (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  const mod = isMac ? 'Cmd' : 'Ctrl';

  const appTitle = document.getElementById('shortcuts-app-title');
  if (appTitle) appTitle.textContent = en ? 'Window & Application' : 'Cửa sổ & Toàn ứng dụng';
  const appDesc = document.getElementById('shortcuts-app-desc');
  if (appDesc) appDesc.textContent = en ? 'Shortcuts available across all windows with automatic context switching:' : 'Các phím tắt hoạt động trên toàn cửa sổ và chuyển vùng tự động:';

  const tabTitle = document.getElementById('shortcuts-tabstrip-title');
  if (tabTitle) tabTitle.textContent = en ? 'Tab Strip' : 'Thanh tab';
  const tabDesc = document.getElementById('shortcuts-tabstrip-desc');
  if (tabDesc) tabDesc.textContent = en ? 'Active only when the tab strip has focus; never intercepts chat typing:' : 'Chỉ áp dụng khi thanh tab đang được chọn (focus); không can thiệp vào khung soạn tin nhắn:';

  const setHeader = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  setHeader('th-app-key', en ? 'Shortcut' : 'Phím');
  setHeader('th-app-action', en ? 'Action' : 'Thao tác');
  setHeader('th-app-context', en ? 'Context' : 'Ngữ cảnh');
  setHeader('th-tab-key', en ? 'Shortcut' : 'Phím');
  setHeader('th-tab-action', en ? 'Action' : 'Thao tác');
  setHeader('th-tab-context', en ? 'Context' : 'Ngữ cảnh');

  const appShortcuts = [
    {
      keys: [`${mod}+T`],
      action: en ? 'New tab (open service picker)' : 'Thêm tab mới (mở menu chọn dịch vụ)',
      context: en ? 'App-wide' : 'Toàn ứng dụng'
    },
    {
      keys: [`${mod}+W`],
      action: en ? 'Close active tab or focused secondary window' : 'Đóng tab đang mở hoặc cửa sổ phụ đang focus',
      context: en ? 'App-wide' : 'Toàn ứng dụng'
    },
    {
      keys: [`${mod}+R`],
      action: en ? 'Reload active tab or focused window' : 'Tải lại tab đang mở hoặc cửa sổ đang focus',
      context: en ? 'App-wide' : 'Toàn ứng dụng'
    },
    {
      keys: [`${mod}+,`],
      action: en ? 'Open Settings' : 'Mở Cài đặt',
      context: en ? 'App-wide' : 'Toàn ứng dụng'
    },
    {
      keys: ['Ctrl+Tab'],
      action: en ? 'Switch to next tab' : 'Chuyển sang tab tiếp theo',
      context: en ? 'App-wide' : 'Toàn ứng dụng'
    },
    {
      keys: ['Ctrl+Shift+Tab'],
      action: en ? 'Switch to previous tab' : 'Chuyển sang tab trước đó',
      context: en ? 'App-wide' : 'Toàn ứng dụng'
    },
    {
      keys: ['Escape'],
      action: en ? 'Close Settings window' : 'Đóng cửa sổ Cài đặt',
      context: en ? 'In Settings' : 'Trong Cài đặt'
    }
  ];

  const tabShortcuts = [
    {
      keys: ['←', '→'],
      action: en ? 'Focus and select previous / next tab' : 'Di chuyển và chọn tab liền trước / liền sau',
      context: en ? 'Tab strip focus' : 'Khi focus thanh tab'
    },
    {
      keys: ['Enter', 'Space'],
      action: en ? 'Select focused tab' : 'Chọn tab đang focus',
      context: en ? 'Tab strip focus' : 'Khi focus thanh tab'
    },
    {
      keys: ['Delete', 'Backspace'],
      action: en ? 'Close focused tab' : 'Đóng tab đang focus',
      context: en ? 'Tab strip focus' : 'Khi focus thanh tab'
    }
  ];

  const renderTableRows = (tbodyId, list) => {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.replaceChildren();
    for (const item of list) {
      const tr = document.createElement('tr');
      const tdKey = document.createElement('td');
      item.keys.forEach((k, idx) => {
        if (idx > 0) tdKey.append(' / ');
        const kbd = document.createElement('kbd');
        kbd.textContent = k;
        tdKey.append(kbd);
      });
      const tdAction = document.createElement('td');
      tdAction.textContent = item.action;
      const tdContext = document.createElement('td');
      tdContext.textContent = item.context;
      tr.append(tdKey, tdAction, tdContext);
      tbody.append(tr);
    }
  };

  renderTableRows('shortcuts-app-rows', appShortcuts);
  renderTableRows('shortcuts-tabstrip-rows', tabShortcuts);
}
function renderPermissions() {
  const list = document.getElementById('permissions-list'); list.replaceChildren();
  const en = currentLang === 'en';
  if (!permissionEntries.length) { list.textContent = en ? 'No saved decisions.' : 'Chưa có quyền đã lưu.'; return; }
  const names = en ? { 'media:audio': 'Microphone', 'media:video': 'Camera', notifications: 'Notifications', fullscreen: 'Full screen', 'clipboard-read': 'Read clipboard', 'clipboard-sanitized-write': 'Write clipboard', 'speaker-selection': 'Audio output' } : { 'media:audio': 'Microphone', 'media:video': 'Camera', notifications: 'Thông báo', fullscreen: 'Toàn màn hình', 'clipboard-read': 'Đọc clipboard', 'clipboard-sanitized-write': 'Ghi clipboard', 'speaker-selection': 'Thiết bị âm thanh' };
  for (const entry of permissionEntries) {
    const row = document.createElement('div'); row.className = 'permission-row';
    const label = document.createElement('span'); label.textContent = `${entry.origin} · ${names[entry.permission] || entry.permission} · ${entry.decision === 'allow' ? (en ? 'Allowed' : 'Cho phép') : (en ? 'Denied' : 'Từ chối')}`;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = en ? 'Revoke' : 'Thu hồi'; button.onclick = () => command({ action: 'permission_revoke', id: entry.id }); row.append(label, button); list.append(row);
  }
}
document.getElementById('workspace-save').onclick = () => command({ action: 'preferences_update', patch: { slack_workspace_url: document.getElementById('workspace-url').value } });
document.getElementById('workspace-open').onclick = async () => {
  if (await command({ action: 'preferences_update', patch: { slack_workspace_url: document.getElementById('workspace-url').value } })) await command({ action: 'slack_open' });
};
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(currentTheme));
window.vxchat.preferences(applyPreferences);
applyTheme(currentTheme); applyLang(currentLang);
void command({ action: 'preferences_get' }); void command({ action: 'permission_list' });
void window.vxchat.command({ action: 'metadata' }).then(result => {
  if (!result.ok) return;
  metadata = result.metadata; renderCommon(); renderShortcuts();
}).catch(() => {});
