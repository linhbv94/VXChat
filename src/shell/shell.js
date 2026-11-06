'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Vector paths for P0 services; using currentColor to adapt dynamically to Light/Dark/Black themes.
const ICON_PATHS = {
  messenger: 'M32,7.51c-13.8,0-24.49,10.11-24.49,23.76,0,7.14,2.93,13.31,7.69,17.57.4.36.64.86.66,1.4l.13,4.36c.04,1.39,1.48,2.29,2.75,1.73l4.86-2.15c.41-.18.87-.22,1.31-.1,2.23.61,4.61.94,7.09.94,13.8,0,24.49-10.11,24.49-23.76S45.8,7.51,32,7.51ZM47.18,24.93l-8.53,13.18h0c-.43.67-1.33.86-1.99.43l-7.9-5.11c-.31-.2-.7-.19-1,.01l-8.9,6.14c-1.3.9-2.89-.65-2.03-1.97l8.53-13.18c.43-.67,1.33-.86,1.99-.43l7.9,5.11c.31.2.7.19,1-.01l8.9-6.14c1.3-.9,2.89.65,2.03,1.97Z',
  zalo: 'M29.72,57.42c-5.73,0-9.5-.76-12.99-2.64-3.27-1.75-5.79-4.28-7.5-7.5-1.87-3.49-2.64-7.26-2.64-12.99v-4.4c0-5.74.76-9.5,2.64-12.99,1.75-3.27,4.28-5.79,7.5-7.5.37-.2.75-.39,1.14-.57.07-.03.14-.05.21-.05.16,0,.32.08.41.22.14.2.11.47-.07.64,0,0-.08.07-.08.07-8.08,7.78-8.99,24.67-1.9,34.16,1.2,1.77.3,4.54-1.27,6.35.19.01.38.02.58.02,1.92,0,4.22-.54,6.02-1.41.07-.03.14-.05.22-.05.08,0,.17.02.24.06,4.06,2.24,9.33,3.48,14.86,3.48,6.01,0,11.62-1.43,15.8-4.02.08-.05.17-.08.26-.08.13,0,.26.05.36.15.16.17.19.43.05.63-1.67,2.46-3.85,4.41-6.46,5.79-3.49,1.87-7.26,2.64-12.99,2.64h-4.4ZM47.4,36.75c-2.91,0-5.28-2.37-5.28-5.28s2.37-5.28,5.28-5.28,5.28,2.37,5.28,5.28-2.37,5.28-5.28,5.28ZM47.4,29.19c-1.27,0-2.31,1.03-2.31,2.31s1.03,2.31,2.31,2.31,2.31-1.03,2.31-2.31-1.03-2.31-2.31-2.31ZM32.73,36.75c-2.89,0-5.24-2.35-5.24-5.24s2.35-5.24,5.24-5.24c.82,0,1.62.19,2.35.56.08-.18.25-.3.46-.3h1.95c.28,0,.5.22.5.5v9.14c0,.28-.22.5-.5.5h-1.12c-.46,0-.87-.24-1.11-.59-.78.44-1.64.67-2.53.67ZM32.73,29.23c-1.26,0-2.29,1.03-2.29,2.29s1.03,2.29,2.29,2.29,2.29-1.03,2.29-2.29-1.03-2.29-2.29-2.29ZM39.86,36.68c-.66,0-1.2-.54-1.2-1.2v-11.39c0-.28.22-.5.5-.5h2.08c.28,0,.5.22.5.5v12.09c0,.28-.22.5-.5.5h-1.38ZM17.49,36.68c-.28,0-.5-.22-.5-.5v-.53c0-.72.16-1.1.45-1.52l6.02-7.46h-5.7c-.28,0-.5-.22-.5-.5v-2.08c0-.28.22-.5.5-.5h9.73c.28,0,.5.22.5.5v.28c0,.54-.06,1.14-.52,1.82,0,.01-.05.08-.06.09-.08.1-.25.31-.35.42l-5.6,7.03h6.05c.28,0,.5.22.5.5v1.12c0,.74-.6,1.33-1.33,1.33h-9.18Z',
  slack: 'M17.7,38.53c0,2.87-2.32,5.19-5.19,5.19s-5.19-2.32-5.19-5.19,2.32-5.19,5.19-5.19h5.19v5.19ZM20.3,38.53c0-2.87,2.32-5.19,5.19-5.19s5.19,2.32,5.19,5.19v12.98c0,2.87-2.32,5.19-5.19,5.19s-5.19-2.32-5.19-5.19v-12.98ZM25.49,17.68c-2.87,0-5.19-2.32-5.19-5.19s2.32-5.19,5.19-5.19,5.19,2.32,5.19,5.19v5.19h-5.19ZM25.49,20.32c2.87,0,5.19,2.32,5.19,5.19s-2.32,5.19-5.19,5.19h-13.02c-2.87,0-5.19-2.32-5.19-5.19s2.32-5.19,5.19-5.19h13.02ZM46.3,25.51c0-2.87,2.32-5.19,5.19-5.19s5.19,2.32,5.19,5.19-2.32,5.19-5.19,5.19h-5.19v-5.19ZM43.7,25.51c0,2.87-2.32,5.19-5.19,5.19s-5.19-2.32-5.19-5.19v-13.02c0-2.87,2.32-5.19,5.19-5.19s5.19,2.32,5.19,5.19c0,0,0,13.02,0,13.02ZM38.51,46.32c2.87,0,5.19,2.32,5.19,5.19s-2.32,5.19-5.19,5.19-5.19-2.32-5.19-5.19v-5.19h5.19ZM38.51,43.72c-2.87,0-5.19-2.32-5.19-5.19s2.32-5.19,5.19-5.19h13.02c2.87,0,5.19,2.32,5.19,5.19s-2.32,5.19-5.19,5.19h-13.02Z',
  chatgpt: 'M34.54,58.02c-3.65,0-7.15-1.49-9.68-4.1-.76.13-1.53.19-2.29.19-4.86,0-9.38-2.62-11.8-6.83-1.86-3.18-2.33-6.97-1.32-10.5-3.65-4.39-4.18-10.55-1.3-15.52,1.82-3.2,4.88-5.51,8.44-6.4,1.97-5.33,7.03-8.88,12.76-8.88h.1c3.66,0,7.15,1.49,9.69,4.11.76-.13,1.53-.2,2.29-.2,4.86,0,9.38,2.62,11.8,6.83,1.86,3.17,2.33,6.97,1.32,10.5,3.64,4.38,4.18,10.55,1.3,15.52-1.82,3.2-4.88,5.51-8.44,6.4-1.97,5.34-7.03,8.88-12.76,8.88h-.11ZM30.49,51.66c1.25.71,2.67,1.09,4.13,1.09,4.62,0,8.38-3.77,8.38-8.38v-11.13l-2.29-1.32v12.32c0,.94-.5,1.82-1.33,2.29l-8.89,5.13ZM14.22,40.52c0,1.44.39,2.87,1.12,4.12,1.5,2.58,4.28,4.19,7.27,4.19,1.46,0,2.9-.39,4.18-1.12l9.63-5.56v-2.65s-10.67,6.16-10.67,6.16c-.4.23-.85.36-1.32.36s-.92-.12-1.32-.36l-8.89-5.14ZM46.95,30.58c.82.47,1.32,1.35,1.31,2.29v10.27c1.24-.73,2.29-1.77,3.01-3.03,2.31-4,.94-9.14-3.07-11.45l-9.64-5.56-2.29,1.32,10.67,6.16ZM12.65,24.02c-2.2,3.98-.81,9.03,3.14,11.32l9.64,5.57,2.29-1.32-10.67-6.16c-.82-.47-1.32-1.34-1.32-2.29v-10.27c-1.24.73-2.28,1.77-3.01,3.03l-.07.12ZM32,37.1l4.42-2.55v-5.1l-4.42-2.55-4.42,2.55v5.1l4.42,2.55ZM23.29,32.08v-12.31c0-.94.51-1.82,1.33-2.29l8.89-5.13c-1.25-.71-2.68-1.09-4.13-1.09h0c-4.62,0-8.38,3.76-8.38,8.37v11.13l2.3,1.32ZM27.58,24.5l10.67-6.16c.4-.23.86-.36,1.32-.36s.92.12,1.32.36l8.89,5.13c-.01-1.43-.4-2.85-1.12-4.11-1.49-2.59-4.28-4.2-7.27-4.2-1.46,0-2.9.39-4.18,1.12l-9.63,5.56v2.65Z'
};

const STRINGS = {
  vi: {
    addTab: 'Thêm tab',
    closeTab: 'Đóng',
    reload: 'Tải lại',
    selectService: '+ Thêm dịch vụ...',
    noTabs: 'Chưa mở tab nào',
    failed: 'Thao tác thất bại',
    disconnected: 'Mất kết nối',
    theme: 'Giao diện',
    lang: 'Ngôn ngữ',
    settings: 'Cài đặt'
  },
  en: {
    addTab: 'Add tab',
    closeTab: 'Close',
    reload: 'Reload',
    selectService: '+ Add service...',
    noTabs: 'No tabs open',
    failed: 'Operation failed',
    disconnected: 'Disconnected',
    theme: 'Theme',
    lang: 'Language',
    settings: 'Settings'
  }
};

const THEMES = ['system', 'dark', 'light', 'black'];

const tabsList = document.getElementById('tabs');
const tabsWrapper = document.getElementById('tabs-wrapper');
const emptyState = document.getElementById('empty-state');
const serviceSelect = document.getElementById('service');
const statusText = document.getElementById('status');
const reloadBtn = document.getElementById('reload');
const themeBtn = document.getElementById('theme-btn');
const langBtn = document.getElementById('lang-btn');
const langBadge = document.getElementById('lang-badge');
const settingsBtn = document.getElementById('settings-btn');

let current = null;
let currentTheme = 'system';
let currentLang = 'vi';
let draggedTabId = null;

function applyTheme(theme) {
  currentTheme = theme;

  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function applyLang(lang) {
  currentLang = lang;

  document.documentElement.setAttribute('lang', lang);
  langBadge.textContent = lang.toUpperCase();
  updateStaticLabels();
  if (current) render(current);
}

function t(key) {
  return STRINGS[currentLang]?.[key] || STRINGS.vi[key] || '';
}

function updateStaticLabels() {
  const addBtn = document.getElementById('add-btn');
  if (addBtn) addBtn.setAttribute('title', t('addTab'));
  if (reloadBtn) reloadBtn.setAttribute('title', `${t('reload')} (Cmd/Ctrl+R)`);
  if (themeBtn) themeBtn.setAttribute('title', t('theme'));
  if (langBtn) langBtn.setAttribute('title', t('lang'));
  if (settingsBtn) settingsBtn.setAttribute('title', `${t('settings')} (Cmd/Ctrl+,)`);
  document.getElementById('setup-btn').title = currentLang === 'en'
    ? 'Open full Facebook (account management / log out)'
    : 'Mở Facebook đầy đủ (quản lý tài khoản / đăng xuất)';
  document.getElementById('page-location').setAttribute('aria-label', currentLang === 'en' ? 'Current page domain' : 'Tên miền trang hiện tại');
  document.getElementById('downloads-btn').title = currentLang === 'en' ? 'Downloads' : 'Tệp đã tải';
  for (const element of [addBtn, reloadBtn, themeBtn, langBtn, settingsBtn, document.getElementById('downloads-btn'), document.getElementById('setup-btn')]) if (element) element.setAttribute('aria-label', element.title);
  serviceSelect.setAttribute('aria-label', t('selectService'));
  document.querySelector('.empty-text').textContent = t('noTabs');
}

function createIcon(serviceId) {
  const pathData = ICON_PATHS[serviceId];
  if (!pathData) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', 'tab-icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathData);
  svg.append(path);
  return svg;
}

async function command(value) {
  try {
    const result = await window.vxchat.command(value);
    if (result.ok) {
      statusText.textContent = '';
      if (result.preferences) applyPreferences(result.preferences);
      if (result.state) render(result.state);
    } else {
      statusText.textContent = t('failed');
    }
  } catch {
    statusText.textContent = t('disconnected');
  }
}

function render(state) {
  if (!state) return;
  current = state;
  if (draggedTabId) return;
  const focusedID = document.activeElement?.closest('.tab')?.dataset.tabId;
  tabsList.replaceChildren();

  const hasTabs = state.tabs && state.tabs.length > 0;
  if (hasTabs) {
    emptyState.classList.remove('is-visible');
    tabsWrapper.style.display = 'flex';
  } else {
    emptyState.classList.add('is-visible');
    tabsWrapper.style.display = 'none';
  }

  for (const tab of state.tabs) {
    const isActive = tab.id === state.active_tab_id;
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.setAttribute('role', 'tab');
    tabEl.setAttribute('aria-selected', String(isActive));
    tabEl.setAttribute('tabindex', isActive ? '0' : '-1');
    tabEl.setAttribute('draggable', 'true');
    tabEl.dataset.tabId = tab.id;

    if (isActive) tabEl.classList.add('is-active');
    if (tab.status === 'loading') tabEl.classList.add('is-loading');
    if (tab.status === 'error') tabEl.classList.add('is-error');

    // Icon
    const icon = createIcon(tab.service_id);
    if (icon) tabEl.append(icon);

    // Indicator
    const indicator = document.createElement('span');
    indicator.className = 'tab-indicator';
    tabEl.append(indicator);

    // Label
    const label = document.createElement('span');
    label.className = 'tab-title';
    label.textContent = tab.label;
    tabEl.append(label);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('tabindex', '-1');
    closeBtn.setAttribute('aria-label', `${t('closeTab')} ${tab.label}`);
    closeBtn.onclick = event => {
      event.stopPropagation();
      command({ action: 'close', tab_id: tab.id });
    };
    tabEl.append(closeBtn);

    // Selection
    tabEl.onclick = () => command({ action: 'select', tab_id: tab.id });

    // Keyboard navigation on tabs
    tabEl.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        command({ action: 'select', tab_id: tab.id });
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        command({ action: 'close', tab_id: tab.id });
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        const next = tabEl.nextElementSibling;
        if (next && next.classList.contains('tab')) {
          next.focus();
          command({ action: 'select', tab_id: next.dataset.tabId });
        }
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const prev = tabEl.previousElementSibling;
        if (prev && prev.classList.contains('tab')) {
          prev.focus();
          command({ action: 'select', tab_id: prev.dataset.tabId });
        }
      }
    });

    // Drag and drop reordering
    tabEl.addEventListener('dragstart', event => {
      draggedTabId = tab.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', tab.id);
      tabEl.classList.add('is-dragging');
    });

    tabEl.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = tabEl.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      if (event.clientX < mid) {
        tabEl.classList.add('drag-over-left');
        tabEl.classList.remove('drag-over-right');
      } else {
        tabEl.classList.add('drag-over-right');
        tabEl.classList.remove('drag-over-left');
      }
    });

    tabEl.addEventListener('dragleave', () => {
      tabEl.classList.remove('drag-over-left', 'drag-over-right');
    });

    tabEl.addEventListener('drop', event => {
      event.preventDefault();
      tabEl.classList.remove('drag-over-left', 'drag-over-right');
      const sourceId = draggedTabId; // Accept only an internal tab drag.
      const targetId = tab.id;
      if (sourceId && targetId && sourceId !== targetId) {
        const rect = tabEl.getBoundingClientRect();
        const ids = window.vxchatTabOrder(current.tabs.map(t => t.id), sourceId, targetId, event.clientX >= rect.left + rect.width / 2);
        if (ids) command({ action: 'reorder', tab_ids: ids });
      }
    });

    tabEl.addEventListener('dragend', () => {
      tabEl.classList.remove('is-dragging');
      document.querySelectorAll('.tab').forEach(el => el.classList.remove('drag-over-left', 'drag-over-right', 'is-dragging'));
      draggedTabId = null;
      if (current) render(current);
    });

    tabsList.append(tabEl);
  }

  if (focusedID) [...tabsList.children].find(el => el.dataset.tabId === focusedID)?.focus();
  renderWorkflow(state);
  const activeTab = state.tabs.find(t => t.id === state.active_tab_id);
  const location = document.getElementById('page-location'); location.textContent = activeTab?.location || ''; location.title = activeTab?.location || '';
  document.getElementById('setup-btn').hidden = activeTab?.service_id !== 'messenger';
  // Populate Add Service dropdown if needed
  if (!serviceSelect.options.length && state.services) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = '+';
    serviceSelect.append(placeholder);

    for (const item of state.services) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.label;
      serviceSelect.append(option);
    }
  }
}

// Event Listeners
serviceSelect.addEventListener('change', () => {
  const serviceId = serviceSelect.value;
  if (serviceId) {
    command({ action: 'add', service_id: serviceId });
    serviceSelect.value = '';
  }
});

reloadBtn.onclick = () => {
  if (current?.active_tab_id) {
    command({ action: 'reload', tab_id: current.active_tab_id });
  }
};

themeBtn.onclick = () => {
  const nextIndex = (THEMES.indexOf(currentTheme) + 1) % THEMES.length;
  command({ action: 'preferences_update', patch: { theme: THEMES[nextIndex] } });
};

langBtn.onclick = () => {
  command({ action: 'preferences_update', patch: { language: currentLang === 'vi' ? 'en' : 'vi' } });
};

if (settingsBtn) {
  settingsBtn.onclick = () => {
    command({ action: 'settings' });
  };
}

// Empty state buttons
document.querySelectorAll('.empty-btn').forEach(btn => {
  btn.onclick = () => {
    const serviceId = btn.dataset.service;
    if (serviceId) command({ action: 'add', service_id: serviceId });
  };
});

// Native menu accelerators own global shortcuts, including when remote content has focus.
function applyPreferences(value) { applyTheme(value.theme); applyLang(value.language); }
const workflow = document.getElementById('workflow');
function renderWorkflow(state) {
  const tab = state.tabs.find(item => item.id === state.active_tab_id);
  workflow.replaceChildren();
  const en = currentLang === 'en';
  const addButton = (label, action, extra = {}) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.onclick = () => command({ action, tab_id: tab.id, ...extra }); workflow.append(button);
  };
  if (tab) {
    const messages = [];
    const pendingSetup = tab.service_id === 'messenger' && !tab.setup?.confirmed;
    if (pendingSetup) messages.push(en ? 'Finish Facebook sign-in. Save or skip saving your login, then confirm here.' : 'Đăng nhập Facebook, chọn lưu hoặc bỏ qua lưu đăng nhập, rồi xác nhận tại đây.');
    if (tab.status === 'error') messages.push(en ? 'Page could not load. Try reloading.' : 'Không tải được trang. Thử tải lại.');
    if (tab.issue) messages.push(en ? 'The workflow needs attention. Check the sign-in window or return to chat.' : 'Luồng cần xử lý. Kiểm tra cửa sổ đăng nhập hoặc quay lại chat.');
    if (tab.popups?.length) messages.push(en ? `${tab.popups.length} associated window(s)` : `${tab.popups.length} cửa sổ liên quan`);
    if (messages.length) {
      const label = document.createElement('span'); label.textContent = messages.join(' '); workflow.append(label);
      if (pendingSetup && tab.setup?.can_confirm) addButton(en ? 'Setup done → Messenger' : 'Đã xong thiết lập → Messenger', 'confirm_setup');
      else if (!pendingSetup) addButton(en ? 'Return to chat' : 'Quay lại chat', 'home');
      for (const popup of tab.popups || []) {
        addButton(`${en ? 'Open' : 'Mở'} ${popup.origin || (en ? 'waiting window' : 'cửa sổ chờ')}`, 'focus_popup', { popup_id: popup.id });
        addButton(en ? 'Close window' : 'Đóng cửa sổ', 'close_popup', { popup_id: popup.id });
      }
    }
  }
  workflow.hidden = !workflow.childElementCount;
}
document.getElementById('setup-btn').onclick = () => { if (current?.active_tab_id) void command({ action: 'setup_reset', tab_id: current.active_tab_id }); };
document.getElementById('menu-btn').onclick = () => command({ action: 'app_menu' });
void window.vxchat.command({ action: 'metadata' }).then(result => { if (result.ok) document.documentElement.dataset.platform = result.metadata.platform; }).catch(() => {});
let downloadCueTimer = null;
function clearDownloadCue() {
  const btn = document.getElementById('downloads-btn');
  const icon = document.getElementById('downloads-icon');
  const live = document.getElementById('downloads-live');
  if (btn) btn.classList.remove('has-completed');
  if (icon) icon.textContent = '↓';
  if (live) live.textContent = '';
  if (downloadCueTimer) {
    clearTimeout(downloadCueTimer);
    downloadCueTimer = null;
  }
}

const downloadTracker = window.vxchatDownloadFeedback?.createDownloadFeedbackTracker?.({
  onCue: completedItems => {
    const btn = document.getElementById('downloads-btn');
    const icon = document.getElementById('downloads-icon');
    const live = document.getElementById('downloads-live');
    if (!btn || !completedItems.length) return;
    btn.classList.add('has-completed');
    if (icon) icon.textContent = '✓';
    if (live && window.vxchatDownloadFeedback?.formatCueText) {
      live.textContent = window.vxchatDownloadFeedback.formatCueText(completedItems, currentLang);
    }
    if (downloadCueTimer) clearTimeout(downloadCueTimer);
    downloadCueTimer = setTimeout(() => {
      clearDownloadCue();
    }, 3500);
  }
});

document.getElementById('downloads-btn').onclick = () => {
  clearDownloadCue();
  void command({ action: 'downloads' });
};
let reportedHeight = 0;
new ResizeObserver(() => {
  const height = Math.max(68, Math.min(220, Math.ceil(document.getElementById('chrome').getBoundingClientRect().height)));
  if (height !== reportedHeight) { reportedHeight = height; void window.vxchat.command({ action: 'layout', height }); }
}).observe(document.getElementById('chrome'));
applyTheme(currentTheme); applyLang(currentLang);
window.vxchat.subscribe(render); window.vxchat.preferences(applyPreferences);
if (window.vxchat.downloads && downloadTracker) window.vxchat.downloads(records => downloadTracker.update(records));
// Only theme/language from the old local shell are eligible for one-time migration.
let legacy = {};
try { legacy = { theme: localStorage.getItem('vxchat_theme'), language: localStorage.getItem('vxchat_lang') }; } catch {}
void command({ action: 'preferences_migrate', patch: legacy });
void command({ action: 'state' });
