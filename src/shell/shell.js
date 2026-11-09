'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Vector paths for P0 services; using currentColor to adapt dynamically to Light/Dark/Black themes.
const ICON_PATHS = {
  messenger: 'M32,7.51c-13.8,0-24.49,10.11-24.49,23.76,0,7.14,2.93,13.31,7.69,17.57.4.36.64.86.66,1.4l.13,4.36c.04,1.39,1.48,2.29,2.75,1.73l4.86-2.15c.41-.18.87-.22,1.31-.1,2.23.61,4.61.94,7.09.94,13.8,0,24.49-10.11,24.49-23.76S45.8,7.51,32,7.51ZM47.18,24.93l-8.53,13.18h0c-.43.67-1.33.86-1.99.43l-7.9-5.11c-.31-.2-.7-.19-1,.01l-8.9,6.14c-1.3.9-2.89-.65-2.03-1.97l8.53-13.18c.43-.67,1.33-.86,1.99-.43l7.9,5.11c.31.2.7.19,1-.01l8.9-6.14c1.3-.9,2.89.65,2.03,1.97Z',
  zalo: 'M29.72,57.42c-5.73,0-9.5-.76-12.99-2.64-3.27-1.75-5.79-4.28-7.5-7.5-1.87-3.49-2.64-7.26-2.64-12.99v-4.4c0-5.74.76-9.5,2.64-12.99,1.75-3.27,4.28-5.79,7.5-7.5.37-.2.75-.39,1.14-.57.07-.03.14-.05.21-.05.16,0,.32.08.41.22.14.2.11.47-.07.64,0,0-.08.07-.08.07-8.08,7.78-8.99,24.67-1.9,34.16,1.2,1.77.3,4.54-1.27,6.35.19.01.38.02.58.02,1.92,0,4.22-.54,6.02-1.41.07-.03.14-.05.22-.05.08,0,.17.02.24.06,4.06,2.24,9.33,3.48,14.86,3.48,6.01,0,11.62-1.43,15.8-4.02.08-.05.17-.08.26-.08.13,0,.26.05.36.15.16.17.19.43.05.63-1.67,2.46-3.85,4.41-6.46,5.79-3.49,1.87-7.26,2.64-12.99,2.64h-4.4ZM47.4,36.75c-2.91,0-5.28-2.37-5.28-5.28s2.37-5.28,5.28-5.28,5.28,2.37,5.28,5.28-2.37,5.28-5.28,5.28ZM47.4,29.19c-1.27,0-2.31,1.03-2.31,2.31s1.03,2.31,2.31,2.31,2.31-1.03,2.31-2.31-1.03-2.31-2.31-2.31ZM32.73,36.75c-2.89,0-5.24-2.35-5.24-5.24s2.35-5.24,5.24-5.24c.82,0,1.62.19,2.35.56.08-.18.25-.3.46-.3h1.95c.28,0,.5.22.5.5v9.14c0,.28-.22.5-.5.5h-1.12c-.46,0-.87-.24-1.11-.59-.78.44-1.64.67-2.53.67ZM32.73,29.23c-1.26,0-2.29,1.03-2.29,2.29s1.03,2.29,2.29,2.29,2.29-1.03,2.29-2.29-1.03-2.29-2.29-2.29ZM39.86,36.68c-.66,0-1.2-.54-1.2-1.2v-11.39c0-.28.22-.5.5-.5h2.08c.28,0,.5.22.5.5v12.09c0,.28-.22.5-.5.5h-1.38ZM17.49,36.68c-.28,0-.5-.22-.5-.5v-.53c0-.72.16-1.1.45-1.52l6.02-7.46h-5.7c-.28,0-.5-.22-.5-.5v-2.08c0-.28.22-.5.5-.5h9.73c.28,0,.5.22.5.5v.28c0,.54-.06,1.14-.52,1.82,0,.01-.05.08-.06.09-.08.1-.25.31-.35.42l-5.6,7.03h6.05c.28,0,.5.22.5.5v1.12c0,.74-.6,1.33-1.33,1.33h-9.18Z',
  slack: 'M17.7,38.53c0,2.87-2.32,5.19-5.19,5.19s-5.19-2.32-5.19-5.19,2.32-5.19,5.19-5.19h5.19v5.19ZM20.3,38.53c0-2.87,2.32-5.19,5.19-5.19s5.19,2.32,5.19,5.19v12.98c0,2.87-2.32,5.19-5.19,5.19s-5.19-2.32-5.19-5.19v-12.98ZM25.49,17.68c-2.87,0-5.19-2.32-5.19-5.19s2.32-5.19,5.19-5.19,5.19,2.32,5.19,5.19v5.19h-5.19ZM25.49,20.32c2.87,0,5.19,2.32,5.19,5.19s-2.32,5.19-5.19,5.19h-13.02c-2.87,0-5.19-2.32-5.19-5.19s2.32-5.19,5.19-5.19h13.02ZM46.3,25.51c0-2.87,2.32-5.19,5.19-5.19s5.19,2.32,5.19,5.19-2.32,5.19-5.19,5.19h-5.19v-5.19ZM43.7,25.51c0,2.87-2.32,5.19-5.19,5.19s-5.19-2.32-5.19-5.19v-13.02c0-2.87,2.32-5.19,5.19-5.19s5.19,2.32,5.19,5.19c0,0,0,13.02,0,13.02ZM38.51,46.32c2.87,0,5.19,2.32,5.19,5.19s-2.32,5.19-5.19,5.19-5.19-2.32-5.19-5.19v-5.19h5.19ZM38.51,43.72c-2.87,0-5.19-2.32-5.19-2.32s2.32-5.19,5.19-5.19h13.02c2.87,0,5.19,2.32,5.19,5.19s-2.32,5.19-5.19,5.19h-13.02Z',
  chatgpt: 'M34.54,58.02c-3.65,0-7.15-1.49-9.68-4.1-.76.13-1.53.19-2.29.19-4.86,0-9.38-2.62-11.8-6.83-1.86-3.18-2.33-6.97-1.32-10.5-3.65-4.39-4.18-10.55-1.3-15.52,1.82-3.2,4.88-5.51,8.44-6.4,1.97-5.33,7.03-8.88,12.76-8.88h.1c3.66,0,7.15,1.49,9.69,4.11.76-.13,1.53-.2,2.29-.2,4.86,0,9.38,2.62,11.8,6.83,1.86,3.17,2.33,6.97,1.32,10.5,3.64,4.38,4.18,10.55,1.3,15.52-1.82,3.2-4.88,5.51-8.44,6.4-1.97,5.34-7.03,8.88-12.76,8.88h-.11ZM30.49,51.66c1.25.71,2.67,1.09,4.13,1.09,4.62,0,8.38-3.77,8.38-8.38v-11.13l-2.29-1.32v12.32c0,.94-.5,1.82-1.33,2.29l-8.89,5.13ZM14.22,40.52c0,1.44.39,2.87,1.12,4.12,1.5,2.58,4.28,4.19,7.27,4.19,1.46,0,2.9-.39,4.18-1.12l9.63-5.56v-2.65s-10.67,6.16-10.67,6.16c-.4.23-.85.36-1.32.36s-.92-.12-1.32-.36l-8.89-5.14ZM46.95,30.58c.82.47,1.32,1.35,1.31,2.29v10.27c1.24-.73,2.29-1.77,3.01-3.03,2.31-4,.94-9.14-3.07-11.45l-9.64-5.56-2.29,1.32,10.67,6.16ZM12.65,24.02c-2.2,3.98-.81,9.03,3.14,11.32l9.64,5.57,2.29-1.32-10.67-6.16c-.82-.47-1.32-1.34-1.32-2.29v-10.27c-1.24.73-2.28,1.77-3.01,3.03l-.07.12ZM32,37.1l4.42-2.55v-5.1l-4.42-2.55-4.42,2.55v5.1l4.42,2.55ZM23.29,32.08v-12.31c0-.94.51-1.82,1.33-2.29l8.89-5.13c-1.25-.71-2.68-1.09-4.13-1.09h0c-4.62,0-8.38,3.76-8.38,8.37v11.13l2.3,1.32ZM27.58,24.5l10.67-6.16c.4-.23.86-.36,1.32-.36s.92.12,1.32.36l8.89,5.13c-.01-1.43-.4-2.85-1.12-4.11-1.49-2.59-4.28-4.2-7.27-4.2-1.46,0-2.9.39-4.18,1.12l-9.63,5.56v2.65Z',
  gmail: 'M11.5,13c-2.49,0-4.5,2.01-4.5,4.5v29c0,2.49,2.01,4.5,4.5,4.5h6.5V27.6l14,10.5,14-10.5V51h6.5c2.49,0,4.5-2.01,4.5-4.5v-29c0-2.49-2.01-4.5-4.5-4.5-1.01,0-1.99.34-2.79.96L32,27.2,14.29,13.96c-.8-.62-1.78-.96-2.79-.96Z',
  gemini: 'M56.11,31.72c-.1-.39-.41-.7-.8-.8-1.5-.38-2.97-.88-4.4-1.49-3.65-1.55-6.96-3.79-9.77-6.59-3.91-3.92-6.7-8.81-8.08-14.17-.15-.59-.75-.95-1.34-.8-.39.1-.7.41-.8.8-1.38,5.36-4.17,10.25-8.08,14.17-2.81,2.8-6.12,5.04-9.77,6.59-1.43.61-2.89,1.11-4.4,1.49-.59.15-.95.74-.81,1.33.1.4.41.71.81.81,1.5.38,2.96.87,4.4,1.49,3.65,1.55,6.96,3.79,9.77,6.59,3.91,3.92,6.7,8.81,8.08,14.17.15.59.74.95,1.33.81.4-.1.71-.41.81-.81.38-1.5.87-2.97,1.49-4.4,1.55-3.65,3.79-6.96,6.59-9.77,3.92-3.91,8.81-6.7,14.17-8.08.59-.15.95-.75.8-1.34Z',
  meet: 'M12,16c-2.76,0-5,2.24-5,5v22c0,2.76,2.24,5,5,5h24c2.76,0,5-2.24,5-5v-5.5l11.2,7.47c1.66,1.1,3.8-.09,3.8-2.08v-21.78c0-1.99-2.14-3.18-3.8-2.08l-11.2,7.47v-5.5c0-2.76-2.24-5-5-5H12Z',
  telegram: 'M32,7.51c-13.53,0-24.49,10.97-24.49,24.49s10.97,24.49,24.49,24.49,24.49-10.97,24.49-24.49S45.53,7.51,32,7.51ZM44.06,22.87c-.14,2.28-4.37,19.29-4.37,19.29,0,0-.25,1-1.16,1.03-.45.01-.89-.15-1.21-.47-.95-.82-3.17-2.39-5.22-3.81-.62.52-1.86,1.59-3.14,2.88-.8.8-1.2.89-1.4.75-.31-.17-.57-.7-.57-.7l-2.8-7.75s-.03,0-.05,0l-5.98-1.95s-.71-.29-.48-.95c.05-.14.14-.25.43-.45,1.32-.92,24.51-9.26,24.51-9.26,0,0,.65-.22,1.04-.07.19.06.34.22.38.42.04.17.06.35.05.53,0,.15-.02.3-.03.52Z',
  whatsapp: 'M6.91,57.53c-.14,0-.27-.06-.37-.16-.12-.13-.17-.32-.11-.49.84-2.71,1.78-5.38,2.68-7.96.55-1.56,1.1-3.13,1.63-4.71-4.31-7.67-4.51-16.45-.55-24.11,3.9-7.55,11.3-12.72,19.32-13.51.93-.09,1.87-.14,2.79-.14,14.15,0,25.27,10.91,25.3,24.83.02,6.57-2.68,13.06-7.41,17.8-4.72,4.73-10.94,7.33-17.53,7.34h0c-2.62,0-5.27-.42-7.88-1.23-.54-.17-1.11-.47-1.7-.79-.86-.46-1.75-.94-2.56-.99-.07,0-.14,0-.22,0-1.33,0-2.95.65-4.51,1.28-.72.29-1.4.56-2.04.76-.59.19-1.16.38-1.72.57-1.66.55-3.23,1.08-5.01,1.5-.04,0-.08.01-.12.01ZM21.06,47.78c.09,0,.18.02.26.07,3.38,2.05,7,3.09,10.79,3.09,10.28,0,19.11-7.63,20.11-17.38.58-5.64-1.25-11.26-5.01-15.43-3.77-4.18-9.01-6.48-14.75-6.48-.52,0-1.05.02-1.58.06-7.03.51-13.11,4.78-16.25,11.42-3.16,6.68-2.53,14.24,1.69,20.23.09.13.12.31.06.46-.72,1.98-1.4,4-2.03,6.03.74-.23,1.46-.47,2.19-.71,1.41-.47,2.87-.95,4.4-1.34.04,0,.08-.01.12-.01ZM38.95,44.16c-.14,0-.27,0-.41,0-6.83-.31-16.19-8.86-18.46-15.26-.76-2.13-.69-5.64.92-7.93.93-1.32,2.24-2.01,3.78-2.01.58,0,1.19.1,1.83.29.13.04.25.14.31.26l.09.18c1.43,2.99,3.58,7.46.11,9.75,1.73,3.43,4.46,5.96,8.31,7.73.72-.53,1.31-1.2,1.93-1.91.36-.42.73-.83,1.12-1.22.1-.09.22-.14.35-.14.06,0,.12.01.18.03,2.65,1.04,4.79,2.15,6.54,3.41.12.09.2.23.21.38.08,1.8-.43,3.29-1.52,4.43-1.23,1.28-3.15,2.02-5.28,2.02Z',
  discord: 'M49.61,15.8c-3.28-1.52-6.8-2.63-10.47-3.26-.45.81-.98,1.89-1.34,2.76-3.9-.58-7.77-.58-11.6,0-.36-.86-.9-1.95-1.36-2.76-3.68.63-7.19,1.74-10.48,3.27-6.63,9.92-8.42,19.59-7.52,29.12,4.39,3.25,8.65,5.23,12.84,6.52,1.03-1.41,1.96-2.91,2.75-4.49-1.51-.57-2.96-1.27-4.33-2.09.36-.27.72-.55,1.06-.83,8.35,3.87,17.42,3.87,25.67,0,.35.29.7.57,1.06.83-1.37.82-2.83,1.52-4.34,2.09.79,1.57,1.71,3.08,2.75,4.49,4.19-1.29,8.45-3.27,12.85-6.52,1.05-11.05-1.8-20.63-7.54-29.13ZM23.57,39.07c-2.51,0-4.56-2.32-4.56-5.14s2.01-5.14,4.56-5.14,4.61,2.32,4.56,5.14c0,2.82-2.01,5.14-4.56,5.14ZM40.43,39.07c-2.51,0-4.56-2.32-4.56-5.14s2.01-5.14,4.56-5.14,4.61,2.32,4.56,5.14c0,2.82-2.01,5.14-4.56,5.14Z'
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


const tabsList = document.getElementById('tabs');
const tabsWrapper = document.getElementById('tabs-wrapper');
const tabsOverflowBtn = document.getElementById('tabs-overflow-btn');
const tabsOverflowCount = document.getElementById('tabs-overflow-count');
const tabsOverflowPanel = document.getElementById('tabs-overflow-panel');
const servicePlusPanel = document.getElementById('service-plus-panel');
const accountActionsPanel = document.getElementById('account-actions-panel');
const profilePanel = document.getElementById('profile-panel');
const profilePanelTitle = document.getElementById('profile-panel-title');
const profileServiceId = document.getElementById('profile-service-id');
const profileEditId = document.getElementById('profile-edit-id');
const profileLabelInput = document.getElementById('profile-label-input');
const profileColorPicker = document.getElementById('profile-color-picker');
const profileSaveBtn = document.getElementById('profile-save-btn');
const profileCancelBtn = document.getElementById('profile-cancel-btn');
const profileCloseBtn = document.getElementById('profile-close-btn');
const statusText = document.getElementById('status');
const reloadBtn = document.getElementById('reload');
const settingsBtn = document.getElementById('settings-btn');

let current = null;
let currentTheme = 'system';
let currentLang = 'vi';
let draggedServiceId = null;
let serviceOrder = ['messenger','zalo','slack','chatgpt','gmail','gemini','meet','telegram','whatsapp','discord'];
let hiddenServices = [];
const ephemeralOpenServices = new Set();
const PROFILE_COLORS = ['blue', 'emerald', 'amber', 'rose', 'violet', 'cyan', 'orange', 'pink'];
let selectedProfileColor = 'blue';

function initColorPicker() {
  if (!profileColorPicker) return;
  profileColorPicker.replaceChildren();
  for (const color of PROFILE_COLORS) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.dataset.color = color;
    swatch.title = color;
    swatch.onclick = () => {
      selectedProfileColor = color;
      for (const s of profileColorPicker.children) {
        s.classList.toggle('is-selected', s.dataset.color === color);
      }
    };
    profileColorPicker.append(swatch);
  }
}

function selectColorSwatch(color) {
  selectedProfileColor = color || 'blue';
  if (!profileColorPicker) return;
  for (const s of profileColorPicker.children) {
    s.classList.toggle('is-selected', s.dataset.color === selectedProfileColor);
  }
}

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
  if (settingsBtn) settingsBtn.setAttribute('title', `${t('settings')} (Cmd/Ctrl+,)`);
  document.getElementById('setup-btn').title = currentLang === 'en'
    ? 'Open full Facebook (account management / log out)'
    : 'Mở Facebook đầy đủ (quản lý tài khoản / đăng xuất)';
  document.getElementById('page-location').setAttribute('aria-label', currentLang === 'en' ? 'Current page domain' : 'Tên miền trang hiện tại');
  document.getElementById('downloads-btn').title = currentLang === 'en' ? 'Downloads' : 'Tệp đã tải';
  for (const element of [addBtn, reloadBtn, settingsBtn, document.getElementById('downloads-btn'), document.getElementById('setup-btn')]) if (element) element.setAttribute('aria-label', element.title);
  const manage = document.getElementById('manage-services');
  manage.title = currentLang === 'en' ? 'Show or hide services' : 'Hiện hoặc ẩn dịch vụ';
  manage.setAttribute('aria-label', manage.title);
  if (tabsOverflowBtn) {
    const count = tabsOverflowCount?.textContent || '';
    tabsOverflowBtn.title = currentLang === 'en'
      ? `${count ? count + ' ' : ''}hidden overflow tabs`
      : `${count ? count + ' ' : ''}tab bị khuất`;
    tabsOverflowBtn.setAttribute('aria-label', tabsOverflowBtn.title);
  }
  if (profileLabelInput) profileLabelInput.placeholder = currentLang === 'en' ? 'Label: Work, Personal...' : 'Nhãn: Work, Cá nhân...';
  if (profileCloseBtn) profileCloseBtn.title = currentLang === 'en' ? 'Close' : 'Đóng';
  if (profileCancelBtn) profileCancelBtn.textContent = currentLang === 'en' ? 'Cancel' : 'Hủy';
  if (profileSaveBtn) profileSaveBtn.textContent = currentLang === 'en' ? 'Save' : 'Lưu';
  renderServiceManager();
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

function renderServiceManager() {
  const panel=document.getElementById('service-manager');if (!current) return;
  const focused=document.activeElement?.dataset.visibilityId;panel.replaceChildren();
  const note=document.createElement('p');note.textContent=currentLang==='en'
    ? 'Drag services to reorder, or use Alt + ← / →. Hiding a shortcut does not close tabs or sign out.'
    : 'Kéo dịch vụ để sắp xếp, hoặc dùng Alt + ← / →. Ẩn nút không đóng tab hay đăng xuất.';panel.append(note);
  for (const id of serviceOrder) {
    const item=current.services?.find(s=>s.id===id);if (!item) continue;
    const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=!hiddenServices.includes(id);input.dataset.visibilityId=id;
    input.onchange=()=>command({action:'preferences_update',patch:{hidden_services:[...panel.querySelectorAll('input[data-visibility-id]')].filter(item=>!item.checked).map(item=>item.dataset.visibilityId)}});
    label.append(input,document.createTextNode(item.label));panel.append(label);
  }
  if (focused) panel.querySelector(`[data-visibility-id="${focused}"]`)?.focus();
}
function getUnopenedHiddenServices() {
  if (!current) return [];
  return serviceOrder.filter(id =>
    hiddenServices.includes(id) &&
    !ephemeralOpenServices.has(id)
  );
}

let reportedHeight = 0;
let reportedContentTop = 0;
let layoutRaf = null;
function syncShellLayout() {
  if (layoutRaf) cancelAnimationFrame(layoutRaf);
  layoutRaf = requestAnimationFrame(() => {
    layoutRaf = null;
    const chromeEl = document.getElementById('chrome');
    if (!chromeEl) return;
    const normalHeight = Math.ceil(chromeEl.getBoundingClientRect().height);
    let maxBottom = normalHeight;
    for (const panel of [tabsOverflowPanel, servicePlusPanel, accountActionsPanel]) {
      if (panel && !panel.hidden) {
        const r = panel.getBoundingClientRect();
        if (r.bottom > maxBottom) {
          maxBottom = Math.ceil(r.bottom + 12);
        }
      }
    }
    const height = Math.max(68, Math.min(520, maxBottom));
    const contentTop = Math.max(68, Math.min(520, normalHeight));
    if (height !== reportedHeight || contentTop !== reportedContentTop) {
      reportedHeight = height;
      reportedContentTop = contentTop;
      void window.vxchat.command({ action: 'layout', height, content_top: contentTop });
    }
  });
}

function positionFloatingDropdown(dropdownEl, anchorEl) {
  if (!dropdownEl) return;
  const rect = anchorEl?.getBoundingClientRect?.();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    dropdownEl.style.top = '70px';
    dropdownEl.style.left = '8px';
    syncShellLayout();
    return;
  }
  const top = Math.max(70, Math.round(rect.bottom + 4));
  dropdownEl.style.top = `${top}px`;
  const panelWidth = dropdownEl.offsetWidth || 220;
  const maxLeft = Math.max(8, (window.innerWidth || 800) - panelWidth - 8);
  const left = Math.max(8, Math.min(maxLeft, Math.round(rect.left)));
  dropdownEl.style.left = `${left}px`;
  syncShellLayout();
}

function quickOpenHiddenService(serviceId, instanceId = null) {
  ephemeralOpenServices.add(serviceId);
  if (tabsOverflowPanel) tabsOverflowPanel.hidden = true;
  tabsOverflowBtn?.setAttribute('aria-expanded', 'false');
  syncShellLayout();
  const existing = current?.tabs?.find(t =>
    instanceId ? t.instance_id === instanceId : t.service_id === serviceId
  );
  if (existing) {
    render(current);
    void command({ action: 'select', tab_id: existing.id });
  } else if (instanceId) {
    void command({ action: 'instance_open', instance_id: instanceId });
  } else {
    void command({ action: 'add', service_id: serviceId });
  }
}

function formatMultiAccountLabel(serviceLabel, profileLabel, tabLabel = null) {
  const base = profileLabel ? `${serviceLabel} (${profileLabel})` : serviceLabel;
  if (!tabLabel || tabLabel === serviceLabel || tabLabel === `${serviceLabel} · ${profileLabel}`) {
    return base;
  }
  if (tabLabel.startsWith(`${base}`)) {
    return tabLabel;
  }
  const legacyPrefix = `${serviceLabel} · ${profileLabel}`;
  if (tabLabel.startsWith(`${legacyPrefix} `)) {
    return `${base}${tabLabel.slice(legacyPrefix.length)}`;
  }
  return base;
}

function renderTabsOverflowPanel() {
  if (!current || !tabsOverflowPanel) return;
  tabsOverflowPanel.replaceChildren();
  const overflowedGroups = [...tabsList.querySelectorAll('.service-group.is-overflowed')];
  const hiddenQuickOpenIds = getUnopenedHiddenServices();
  if (!overflowedGroups.length && !hiddenQuickOpenIds.length) {
    tabsOverflowPanel.hidden = true;
    tabsOverflowBtn?.setAttribute('aria-expanded', 'false');
    syncShellLayout();
    return;
  }

  if (overflowedGroups.length) {
    const header = document.createElement('p');
    header.className = 'overflow-header';
    header.textContent = currentLang === 'en'
      ? 'Overflowed tabs'
      : 'Tab bị khuất';
    tabsOverflowPanel.append(header);

    const container = document.createElement('div');
    container.className = 'overflow-items';

    for (const group of overflowedGroups) {
      const serviceId = group.dataset.serviceId;
      const definition = current.services?.find(s => s.id === serviceId);
      const serviceLabel = definition ? definition.label : serviceId;
      const tabs = current.tabs.filter(t => t.service_id === serviceId);
      const instances = (current.instances || []).filter(i => i.service_id === serviceId);

      if (tabs.length) {
        for (const tab of tabs) {
          const item = document.createElement('div');
          item.className = 'overflow-item';
          if (tab.id === current.active_tab_id) item.classList.add('is-active');
          item.setAttribute('role', 'button');
          item.tabIndex = 0;
          const icon = createIcon(serviceId);
          if (icon) item.append(icon);
          const title = document.createElement('span');
          title.textContent = instances.length >= 2
            ? formatMultiAccountLabel(serviceLabel, tab.profile_label, tab.label)
            : tab.label;
          item.append(title);

          item.onclick = () => {
            tabsOverflowPanel.hidden = true;
            tabsOverflowBtn?.setAttribute('aria-expanded', 'false');
            syncShellLayout();
            void command({ action: 'select', tab_id: tab.id });
          };
          item.onkeydown = event => {
            if (['Enter', ' '].includes(event.key)) {
              event.preventDefault();
              item.click();
            }
          };

          const close = document.createElement('button');
          close.type = 'button';
          close.className = 'overflow-item-close';
          close.textContent = '×';
          close.title = `${t('closeTab')} ${tab.label}`;
          close.setAttribute('aria-label', close.title);
          close.onclick = event => {
            event.stopPropagation();
            void command({ action: 'close', tab_id: tab.id });
          };
          item.append(close);
          container.append(item);
        }

        for (const inst of instances) {
          const hasOpenTab = tabs.some(t => t.instance_id === inst.id || t.id === inst.id);
          if (!hasOpenTab) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'overflow-item';
            const icon = createIcon(serviceId);
            if (icon) item.append(icon);
            const title = document.createElement('span');
            title.textContent = instances.length >= 2
              ? formatMultiAccountLabel(serviceLabel, inst.profile_label)
              : serviceLabel;
            item.append(title);
            const status = document.createElement('span');
            status.className = 'overflow-item-status';
            status.textContent = currentLang === 'en' ? '(Not open)' : '(Chưa mở)';
            item.append(status);
            item.onclick = () => {
              tabsOverflowPanel.hidden = true;
              tabsOverflowBtn?.setAttribute('aria-expanded', 'false');
              syncShellLayout();
              void command({ action: 'instance_open', instance_id: inst.id });
            };
            container.append(item);
          }
        }
      } else {
        if (instances.length >= 2) {
          for (const inst of instances) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'overflow-item';
            const icon = createIcon(serviceId);
            if (icon) item.append(icon);
            const title = document.createElement('span');
            title.textContent = formatMultiAccountLabel(serviceLabel, inst.profile_label);
            item.append(title);
            const status = document.createElement('span');
            status.className = 'overflow-item-status';
            status.textContent = currentLang === 'en' ? '(Not open)' : '(Chưa mở)';
            item.append(status);
            item.onclick = () => {
              tabsOverflowPanel.hidden = true;
              tabsOverflowBtn?.setAttribute('aria-expanded', 'false');
              syncShellLayout();
              void command({ action: 'instance_open', instance_id: inst.id });
            };
            container.append(item);
          }
        } else {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'overflow-item';
          const icon = createIcon(serviceId);
          if (icon) item.append(icon);
          const title = document.createElement('span');
          title.textContent = serviceLabel;
          item.append(title);
          const status = document.createElement('span');
          status.className = 'overflow-item-status';
          status.textContent = currentLang === 'en' ? '(Not open)' : '(Chưa mở)';
          item.append(status);

          item.onclick = () => {
            tabsOverflowPanel.hidden = true;
            tabsOverflowBtn?.setAttribute('aria-expanded', 'false');
            syncShellLayout();
            void command({ action: 'add', service_id: serviceId });
          };
          container.append(item);
        }
      }
    }
    tabsOverflowPanel.append(container);
  }

  if (hiddenQuickOpenIds.length) {
    if (overflowedGroups.length) {
      const div = document.createElement('span');
      div.className = 'panel-divider';
      tabsOverflowPanel.append(div);
    }
    const hiddenHeader = document.createElement('p');
    hiddenHeader.className = 'overflow-header';
    hiddenHeader.textContent = currentLang === 'en'
      ? 'Hidden services'
      : 'Dịch vụ đang ẩn';
    tabsOverflowPanel.append(hiddenHeader);

    const hiddenContainer = document.createElement('div');
    hiddenContainer.className = 'overflow-items';

    for (const serviceId of hiddenQuickOpenIds) {
      const definition = current.services?.find(s => s.id === serviceId);
      const serviceLabel = definition ? definition.label : serviceId;
      const instances = (current.instances || []).filter(i => i.service_id === serviceId);
      if (instances.length >= 2) {
        for (const inst of instances) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'overflow-item is-hidden-service';
          item.dataset.quickOpenService = serviceId;
          item.dataset.instanceId = inst.id;
          const icon = createIcon(serviceId);
          if (icon) item.append(icon);
          const title = document.createElement('span');
          title.textContent = formatMultiAccountLabel(serviceLabel, inst.profile_label);
          item.append(title);
          item.onclick = () => {
            quickOpenHiddenService(serviceId, inst.id);
          };
          hiddenContainer.append(item);
        }
      } else {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'overflow-item is-hidden-service';
        item.dataset.quickOpenService = serviceId;
        const icon = createIcon(serviceId);
        if (icon) item.append(icon);
        const title = document.createElement('span');
        title.textContent = serviceLabel;
        item.append(title);
        item.onclick = () => {
          quickOpenHiddenService(serviceId);
        };
        hiddenContainer.append(item);
      }
    }
    tabsOverflowPanel.append(hiddenContainer);
  }

  positionFloatingDropdown(tabsOverflowPanel, tabsOverflowBtn);
}

let updatingOverflow = false;
function updateOverflow() {
  if (updatingOverflow || !current || !tabsWrapper || !tabsList) return;
  updatingOverflow = true;
  try {
    const groups = [...tabsList.querySelectorAll('.service-group')];
    const hiddenQuickOpenIds = getUnopenedHiddenServices();
    if (!groups.length && !hiddenQuickOpenIds.length) {
      if (tabsOverflowBtn) tabsOverflowBtn.hidden = true;
      if (tabsOverflowPanel) tabsOverflowPanel.hidden = true;
      syncShellLayout();
      return;
    }
    const availWidth = tabsWrapper.clientWidth;
    if (availWidth <= 0) return;

    for (const g of groups) g.classList.remove('is-overflowed');
    const widths = groups.map(g => g.offsetWidth);

    const activeTabId = current.active_tab_id;
    let activeIndex = -1;
    if (activeTabId) {
      activeIndex = groups.findIndex(g => g.querySelector(`[data-tab-id="${activeTabId}"]`));
    }

    const calc = window.vxchatTabOverflow?.calculateTabOverflow;
    if (!calc) return;
    const reservePill = hiddenQuickOpenIds.length > 0;
    const { overflowCount, overflowIndices } = calc({
      groupWidths: widths,
      availableWidth: reservePill ? Math.max(0, availWidth - 45) : availWidth,
      activeIndex,
      pillWidth: reservePill ? 0 : 42,
      gap: 3
    });

    const overflowSet = new Set(overflowIndices);
    groups.forEach((group, index) => {
      if (overflowSet.has(index)) {
        group.classList.add('is-overflowed');
      } else {
        group.classList.remove('is-overflowed');
      }
    });

    const overflowedPinnedCount = overflowIndices.reduce((sum, idx) => {
      const group = groups[idx];
      if (!group) return sum;
      return sum + Math.max(1, group.querySelectorAll('.tab').length);
    }, 0);
    const totalPillCount = overflowCount + hiddenQuickOpenIds.length;
    if (totalPillCount > 0 && tabsOverflowBtn) {
      tabsOverflowBtn.hidden = false;
      if (tabsOverflowCount) {
        if (overflowedPinnedCount > 0) {
          tabsOverflowCount.hidden = false;
          tabsOverflowCount.textContent = String(overflowedPinnedCount);
        } else {
          tabsOverflowCount.hidden = true;
          tabsOverflowCount.textContent = '';
        }
      }
      tabsOverflowBtn.title = currentLang === 'en'
        ? 'Quick-open hidden services / overflow tabs'
        : 'Mở nhanh dịch vụ đang ẩn / tab bị khuất';
      tabsOverflowBtn.setAttribute('aria-label', tabsOverflowBtn.title);
      if (tabsOverflowPanel && !tabsOverflowPanel.hidden) {
        renderTabsOverflowPanel();
      }
    } else if (tabsOverflowBtn) {
      tabsOverflowBtn.hidden = true;
      if (tabsOverflowCount) {
        tabsOverflowCount.hidden = true;
        tabsOverflowCount.textContent = '';
      }
      tabsOverflowBtn.setAttribute('aria-expanded', 'false');
      if (tabsOverflowPanel) tabsOverflowPanel.hidden = true;
      syncShellLayout();
    }
  } finally {
    updatingOverflow = false;
  }
}

function closeAllAccordionPanels() {
  if (tabsOverflowPanel) {
    tabsOverflowPanel.hidden = true;
    tabsOverflowBtn?.setAttribute('aria-expanded', 'false');
  }
  const serviceMgr = document.getElementById('service-manager');
  if (serviceMgr) {
    serviceMgr.hidden = true;
    document.getElementById('manage-services')?.setAttribute('aria-expanded', 'false');
  }
  if (servicePlusPanel) servicePlusPanel.hidden = true;
  if (accountActionsPanel) accountActionsPanel.hidden = true;
  if (profilePanel) profilePanel.hidden = true;
  syncShellLayout();
}

document.getElementById('manage-services').onclick=()=>{
  const panel=document.getElementById('service-manager');
  const willOpen = panel.hidden;
  closeAllAccordionPanels();
  if (willOpen) {
    panel.hidden = false;
    document.getElementById('manage-services').setAttribute('aria-expanded','true');
    renderServiceManager();
    syncShellLayout();
  }
};
document.getElementById('service-manager').onkeydown=event=>{
  if(event.key==='Escape'){document.getElementById('service-manager').hidden=true;const button=document.getElementById('manage-services');button.setAttribute('aria-expanded','false');button.focus();syncShellLayout();}
};

let overflowHoverTimer = null;
function clearOverflowHoverTimer() {
  if (overflowHoverTimer) {
    clearTimeout(overflowHoverTimer);
    overflowHoverTimer = null;
  }
}

if (tabsOverflowBtn) {
  tabsOverflowBtn.onclick = () => {
    clearOverflowHoverTimer();
    const willOpen = tabsOverflowPanel.hidden;
    closeAllAccordionPanels();
    if (willOpen) {
      tabsOverflowPanel.hidden = false;
      tabsOverflowBtn.setAttribute('aria-expanded', 'true');
      renderTabsOverflowPanel();
      tabsOverflowPanel.querySelector('.overflow-item')?.focus();
    }
  };
  tabsOverflowBtn.onmouseenter = () => {
    clearOverflowHoverTimer();
    if (tabsOverflowPanel && tabsOverflowPanel.hidden) {
      closeAllAccordionPanels();
      tabsOverflowPanel.hidden = false;
      tabsOverflowBtn.setAttribute('aria-expanded', 'true');
      renderTabsOverflowPanel();
    }
  };
  tabsOverflowBtn.onmouseleave = () => {
    clearOverflowHoverTimer();
    overflowHoverTimer = setTimeout(() => {
      if (tabsOverflowPanel && !tabsOverflowPanel.hidden && !tabsOverflowPanel.matches(':hover')) {
        tabsOverflowPanel.hidden = true;
        tabsOverflowBtn.setAttribute('aria-expanded', 'false');
        syncShellLayout();
      }
    }, 200);
  };
}

if (tabsOverflowPanel) {
  tabsOverflowPanel.onmouseenter = () => {
    clearOverflowHoverTimer();
  };
  tabsOverflowPanel.onmouseleave = () => {
    clearOverflowHoverTimer();
    overflowHoverTimer = setTimeout(() => {
      if (!tabsOverflowBtn?.matches(':hover')) {
        tabsOverflowPanel.hidden = true;
        tabsOverflowBtn?.setAttribute('aria-expanded', 'false');
        syncShellLayout();
      }
    }, 200);
  };
  tabsOverflowPanel.onkeydown = event => {
    if (event.key === 'Escape') {
      tabsOverflowPanel.hidden = true;
      tabsOverflowBtn?.setAttribute('aria-expanded', 'false');
      tabsOverflowBtn?.focus();
      syncShellLayout();
    }
  };
}
function moveService(source,target,after){
  const order=window.vxchatTabOrder(serviceOrder,source,target,after);
  if(order) void command({action:'preferences_update',patch:{service_order:order}});
}

function openProfilePanel(serviceId, profileToEdit = null) {
  if (!profilePanel) return;
  closeAllAccordionPanels();
  void window.vxchat.command({ action: 'download_panel_hide' });
  const def = current?.services?.find(s => s.id === serviceId);
  const serviceName = def ? def.label : serviceId;

  if (profileToEdit) {
    profilePanelTitle.textContent = currentLang === 'en'
      ? `Edit profile · ${serviceName}`
      : `Đổi tên / màu hồ sơ · ${serviceName}`;
    profileServiceId.value = serviceId;
    profileEditId.value = profileToEdit.id;
    profileLabelInput.value = profileToEdit.label || '';
    selectColorSwatch(profileToEdit.color || 'blue');
  } else {
    profilePanelTitle.textContent = currentLang === 'en'
      ? `Add profile · ${serviceName}`
      : `Thêm hồ sơ · ${serviceName}`;
    profileServiceId.value = serviceId;
    profileEditId.value = '';
    profileLabelInput.value = '';
    const usedColors = new Set((current?.profiles || []).map(p => p.color));
    const nextColor = PROFILE_COLORS.find(c => !usedColors.has(c)) || 'amber';
    selectColorSwatch(nextColor);
  }
  profilePanel.hidden = false;
  syncShellLayout();
  setTimeout(() => profileLabelInput?.focus(), 50);
}

function openAccountActionsPanel(instance, serviceId, anchorEl = null) {
  if (!accountActionsPanel || !instance) return;
  closeAllAccordionPanels();
  void window.vxchat.command({ action: 'download_panel_hide' });
  accountActionsPanel.replaceChildren();

  const def = current?.services?.find(s => s.id === serviceId);
  const serviceName = def ? def.label : serviceId;
  const profile = (current?.profiles || []).find(p => p.id === instance.profile_id);
  const isDefault = profile?.is_default || instance.id.startsWith('default_');
  const displayName = instance.profile_label || profile?.label || serviceName;

  const title = document.createElement('span');
  title.className = 'chrome-panel-title';
  title.textContent = `${serviceName} (${displayName})`;
  accountActionsPanel.append(title);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'panel-action-item';
  addBtn.dataset.action = 'add-profile';
  addBtn.textContent = currentLang === 'en'
    ? `➕ Add new ${serviceName} profile…`
    : `➕ Thêm hồ sơ ${serviceName} mới…`;
  addBtn.onclick = () => {
    accountActionsPanel.hidden = true;
    openProfilePanel(serviceId, null);
  };
  accountActionsPanel.append(addBtn);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'panel-action-item';
  editBtn.dataset.action = 'edit-profile';
  editBtn.textContent = currentLang === 'en' ? '✏️ Edit profile name / color…' : '✏️ Đổi tên / màu hồ sơ…';
  editBtn.onclick = () => {
    accountActionsPanel.hidden = true;
    openProfilePanel(serviceId, profile || { id: instance.profile_id, label: instance.profile_label || instance.label, color: instance.profile_color || 'blue' });
  };
  accountActionsPanel.append(editBtn);

  if (!isDefault && profile) {
    const divider = document.createElement('span');
    divider.className = 'panel-divider';
    accountActionsPanel.append(divider);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'panel-action-item is-danger';
    delBtn.dataset.action = 'delete-profile';
    delBtn.textContent = currentLang === 'en' ? '🗑️ Delete profile' : '🗑️ Xóa hồ sơ';
    delBtn.onclick = async () => {
      accountActionsPanel.hidden = true;
      syncShellLayout();
      const confirmed = window.confirm(currentLang === 'en'
        ? `Delete profile "${profile.label}" and close all its tabs?`
        : `Bạn có chắc muốn xóa hồ sơ "${profile.label}" và đóng mọi tab liên quan không?`);
      if (confirmed) {
        await command({ action: 'account_delete', profile_id: profile.id });
      }
    };
    accountActionsPanel.append(delBtn);
  }

  accountActionsPanel.hidden = false;
  positionFloatingDropdown(accountActionsPanel, anchorEl || document.querySelector(`[data-launch-service="${serviceId}"]`));
}

function openServicePlusPanel(serviceId, anchorEl = null) {
  if (!servicePlusPanel) return;
  closeAllAccordionPanels();
  void window.vxchat.command({ action: 'download_panel_hide' });
  servicePlusPanel.replaceChildren();

  const def = current?.services?.find(s => s.id === serviceId);
  const serviceName = def ? def.label : serviceId;
  const instances = (current?.instances || []).filter(i => i.service_id === serviceId);

  const title = document.createElement('span');
  title.className = 'chrome-panel-title';
  title.textContent = currentLang === 'en'
    ? `New ${serviceName} session`
    : `Mở phiên ${serviceName} mới`;
  servicePlusPanel.append(title);

  for (const inst of instances) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'panel-action-item';
    const icon = createIcon(serviceId);
    if (icon) item.append(icon);
    const text = document.createElement('span');
    const label = formatMultiAccountLabel(serviceName, inst.profile_label);
    text.textContent = label;
    item.append(text);
    item.onclick = () => {
      servicePlusPanel.hidden = true;
      syncShellLayout();
      void command({ action: 'instance_open', instance_id: inst.id });
    };
    servicePlusPanel.append(item);
  }

  servicePlusPanel.hidden = false;
  positionFloatingDropdown(servicePlusPanel, anchorEl || document.querySelector(`[data-add-service="${serviceId}"]`));
}

async function saveProfile() {
  const serviceId = profileServiceId.value;
  const editId = profileEditId.value;
  const label = (profileLabelInput.value || '').trim();
  if (!label) return;
  const color = selectedProfileColor || 'blue';
  profilePanel.hidden = true;
  syncShellLayout();
  if (editId) {
    await command({ action: 'account_update', profile_id: editId, label, color });
  } else {
    await command({ action: 'account_create', service_id: serviceId, label, color });
  }
}

if (profileSaveBtn) profileSaveBtn.onclick = () => void saveProfile();
if (profileCancelBtn) profileCancelBtn.onclick = () => { profilePanel.hidden = true; syncShellLayout(); };
if (profileCloseBtn) profileCloseBtn.onclick = () => { profilePanel.hidden = true; syncShellLayout(); };
if (profileLabelInput) {
  profileLabelInput.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void saveProfile();
    } else if (e.key === 'Escape') {
      profilePanel.hidden = true;
      syncShellLayout();
    }
  };
}

function tabButton(tab, { showDot = false, dotColor = 'blue', displayLabel = null, instance = null } = {}) {
  const active = tab.id === current.active_tab_id;
  const element = document.createElement('div');
  element.className = 'tab';
  element.dataset.tabId = tab.id;
  if (dotColor) element.dataset.profileColor = dotColor;
  element.setAttribute('role', 'tab');
  element.setAttribute('aria-selected', String(active));
  element.tabIndex = 0;
  element.classList.toggle('is-active', active);
  element.classList.toggle('is-loading', tab.status === 'loading');
  element.classList.toggle('is-error', tab.status === 'error');

  const icon = createIcon(tab.service_id);
  if (icon) element.append(icon);

  if (showDot) {
    const dot = document.createElement('span');
    dot.className = 'profile-dot';
    dot.dataset.color = dotColor;
    element.append(dot);
  }

  const indicator = document.createElement('span');
  indicator.className = 'tab-indicator';
  element.append(indicator);

  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = displayLabel || tab.label;
  element.append(title);

  element.onclick = () => command({ action: 'select', tab_id: tab.id });
  element.oncontextmenu = event => {
    event.preventDefault();
    openAccountActionsPanel(instance || current?.instances?.find(i => i.id === tab.instance_id), tab.service_id, element);
  };

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'tab-close';
  close.textContent = '×';
  close.setAttribute('aria-label', `${t('closeTab')} ${displayLabel || tab.label}`);
  close.onclick = event => {
    event.stopPropagation();
    void command({ action: 'close', tab_id: tab.id });
  };
  element.append(close);

  element.onkeydown = event => {
    if (event.target !== element || event.altKey) return;
    if (['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      void command({ action: 'select', tab_id: tab.id });
    }
    if (['Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault();
      void command({ action: 'close', tab_id: tab.id });
    }
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      const tabs = [...tabsList.querySelectorAll('[role="tab"]')];
      const next = tabs[tabs.indexOf(element) + (event.key === 'ArrowRight' ? 1 : -1)];
      if (next) {
        event.preventDefault();
        next.focus();
        void command({ action: 'select', tab_id: next.dataset.tabId });
      }
    }
  };
  return element;
}

function render(state) {
  if (!state) return;
  current = state;
  if (draggedServiceId) return;

  const focus = document.activeElement;
  const focusTab = focus?.closest('.tab')?.dataset.tabId;
  const focusService = focus?.closest('.service-group')?.dataset.serviceId;
  const focusPlus = focus?.dataset.addService;

  tabsList.replaceChildren();

  for (const id of [...ephemeralOpenServices]) {
    if (!hiddenServices.includes(id) || !state.tabs.some(t => t.service_id === id)) {
      ephemeralOpenServices.delete(id);
    }
  }

  for (const id of serviceOrder.filter(id => !hiddenServices.includes(id) || ephemeralOpenServices.has(id))) {
    const definition = state.services?.find(item => item.id === id);
    if (!definition) continue;

    const group = document.createElement('div');
    group.className = 'service-group';
    group.dataset.serviceId = id;
    group.draggable = true;

    const instances = (state.instances || []).filter(i => i.service_id === id);
    const serviceTabs = state.tabs.filter(t => t.service_id === id);
    const isMultiAccount = instances.length >= 2;

    if (!isMultiAccount) {
      const instance = instances[0] || null;
      let primary;
      if (serviceTabs.length) {
        primary = tabButton(serviceTabs[0], { instance, showDot: false });
        primary.dataset.launchService = id;
        group.append(primary);
        for (const tab of serviceTabs.slice(1)) {
          group.append(tabButton(tab, { instance, showDot: false }));
        }
      } else {
        primary = document.createElement('button');
        primary.type = 'button';
        primary.className = 'tab service-launch is-unopened';
        primary.dataset.launchService = id;
        const icon = createIcon(id);
        if (icon) primary.append(icon);
        const label = document.createElement('span');
        label.className = 'tab-title';
        label.textContent = definition.label;
        primary.append(label);
        primary.title = `${definition.label} · ${currentLang === 'en' ? 'Not open · click to open' : 'Chưa mở · bấm để mở'}`;
        primary.onclick = () => command({ action: 'add', service_id: id });
        if (instance) {
          primary.oncontextmenu = e => {
            e.preventDefault();
            openAccountActionsPanel(instance, id, primary);
          };
        }
        group.append(primary);
      }

      if (definition.multiTab) {
        const plus = document.createElement('button');
        plus.type = 'button';
        plus.className = 'service-plus';
        plus.textContent = '+';
        plus.dataset.addService = id;
        plus.title = currentLang === 'en'
          ? `New ${definition.label} session`
          : `Mở phiên ${definition.label} mới`;
        plus.setAttribute('aria-label', plus.title);
        plus.onclick = () => command({ action: 'add', service_id: id });
        group.append(plus);
      }
    } else {
      // Multi-account
      let firstRendered = true;
      for (const instance of instances) {
        const instTabs = serviceTabs.filter(t => t.instance_id === instance.id);
        const baseFormatted = formatMultiAccountLabel(definition.label, instance.profile_label);
        if (instTabs.length) {
          for (const tab of instTabs) {
            const displayLabel = formatMultiAccountLabel(definition.label, instance.profile_label, tab.label);
            const btn = tabButton(tab, {
              showDot: true,
              dotColor: instance.profile_color || 'blue',
              displayLabel,
              instance
            });
            if (firstRendered) {
              btn.dataset.launchService = id;
              firstRendered = false;
            }
            group.append(btn);
          }
        } else {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tab service-launch is-unopened';
          btn.dataset.instanceId = instance.id;
          btn.dataset.profileColor = instance.profile_color || 'blue';
          if (firstRendered) {
            btn.dataset.launchService = id;
            firstRendered = false;
          }
          const icon = createIcon(id);
          if (icon) btn.append(icon);
          const dot = document.createElement('span');
          dot.className = 'profile-dot';
          dot.dataset.color = instance.profile_color || 'blue';
          btn.append(dot);
          const label = document.createElement('span');
          label.className = 'tab-title';
          label.textContent = baseFormatted;
          btn.append(label);
          btn.title = `${baseFormatted} · ${currentLang === 'en' ? 'Not open · click to open' : 'Chưa mở · bấm để mở'}`;
          btn.onclick = () => command({ action: 'instance_open', instance_id: instance.id });
          btn.oncontextmenu = e => {
            e.preventDefault();
            openAccountActionsPanel(instance, id, btn);
          };
          group.append(btn);
        }
      }

      if (definition.multiTab) {
        const plus = document.createElement('button');
        plus.type = 'button';
        plus.className = 'service-plus';
        plus.textContent = '+';
        plus.dataset.addService = id;
        plus.title = currentLang === 'en'
          ? `New ${definition.label} session`
          : `Mở phiên ${definition.label} mới`;
        plus.setAttribute('aria-label', plus.title);
        plus.onclick = () => openServicePlusPanel(id, plus);
        group.append(plus);
      }
    }

    group.onkeydown = event => {
      if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const after = event.key === 'ArrowRight';
      const target = serviceOrder[serviceOrder.indexOf(id) + (after ? 1 : -1)];
      if (target) {
        event.preventDefault();
        moveService(id, target, after);
      }
    };
    group.ondragstart = event => {
      draggedServiceId = id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
      group.classList.add('is-dragging');
    };
    group.ondragover = event => {
      if (draggedServiceId) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        group.classList.add('drag-over');
      }
    };
    group.ondragleave = () => group.classList.remove('drag-over');
    group.ondrop = event => {
      if (!draggedServiceId) return;
      event.preventDefault();
      const source = draggedServiceId;
      draggedServiceId = null;
      const rect = group.getBoundingClientRect();
      moveService(source, id, event.clientX >= rect.left + rect.width / 2);
      render(current);
    };
    group.ondragend = () => {
      draggedServiceId = null;
      render(current);
    };
    tabsList.append(group);
  }

  const restore = (focusPlus && tabsList.querySelector(`[data-add-service="${focusPlus}"]`))
    || (focusTab && tabsList.querySelector(`[data-tab-id="${focusTab}"]`))
    || (focusService && tabsList.querySelector(`[data-launch-service="${focusService}"]`));
  restore?.focus();
  renderServiceManager();
  renderWorkflow(state);
  const active = state.tabs.find(tab => tab.id === state.active_tab_id);
  const location = document.getElementById('page-location');
  location.textContent = active?.location || '';
  location.title = location.textContent;
  document.getElementById('setup-btn').hidden = active?.service_id !== 'messenger';
  updateOverflow();
}

reloadBtn.onclick = () => {
  if (current?.active_tab_id) {
    command({ action: 'reload', tab_id: current.active_tab_id });
  }
};

if (settingsBtn) {
  settingsBtn.onclick = () => {
    command({ action: 'settings' });
  };
}

// Native menu accelerators own global shortcuts, including when remote content has focus.
function applyPreferences(value) {
  serviceOrder = value.service_order || serviceOrder;
  const nextHidden = value.hidden_services || [];
  for (const id of nextHidden) {
    if (!hiddenServices.includes(id)) ephemeralOpenServices.delete(id);
  }
  for (const id of [...ephemeralOpenServices]) {
    if (!nextHidden.includes(id)) ephemeralOpenServices.delete(id);
  }
  hiddenServices = nextHidden;
  applyTheme(value.theme); applyLang(value.language);
}
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
const DOWNLOAD_SVG_PATHS = {
  download: ['M12 15V3', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5'],
  check: ['M20 6 9 17l-5-5']
};
function setDownloadIcon(kind) {
  const icon = document.getElementById('downloads-icon');
  if (!icon) return;
  icon.dataset.icon = kind;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', kind === 'check' ? '2.5' : '2.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of DOWNLOAD_SVG_PATHS[kind] || DOWNLOAD_SVG_PATHS.download) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  icon.replaceChildren(svg);
}
let downloadCueTimer = null;
function clearDownloadCue() {
  const btn = document.getElementById('downloads-btn');
  const live = document.getElementById('downloads-live');
  if (btn) btn.classList.remove('has-completed');
  setDownloadIcon('download');
  if (live) live.textContent = '';
  if (downloadCueTimer) {
    clearTimeout(downloadCueTimer);
    downloadCueTimer = null;
  }
}

const downloadTracker = window.vxchatDownloadFeedback?.createDownloadFeedbackTracker?.({
  onCue: completedItems => {
    const btn = document.getElementById('downloads-btn');
    const live = document.getElementById('downloads-live');
    if (!btn || !completedItems.length) return;
    btn.classList.add('has-completed');
    setDownloadIcon('check');
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
  void command({ action: 'download_panel' });
};
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('#downloads-btn')) void window.vxchat.command({ action: 'download_panel_hide' });
  let closed = false;
  if (tabsOverflowPanel && !tabsOverflowPanel.hidden && !event.target.closest('#tabs-overflow-panel') && !event.target.closest('#tabs-overflow-btn')) {
    tabsOverflowPanel.hidden = true;
    tabsOverflowBtn?.setAttribute('aria-expanded', 'false');
    closed = true;
  }
  if (servicePlusPanel && !servicePlusPanel.hidden && !event.target.closest('#service-plus-panel') && !event.target.closest('.service-plus')) {
    servicePlusPanel.hidden = true;
    closed = true;
  }
  if (accountActionsPanel && !accountActionsPanel.hidden && !event.target.closest('#account-actions-panel') && !event.target.closest('.tab')) {
    accountActionsPanel.hidden = true;
    closed = true;
  }
  if (closed) syncShellLayout();
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeAllAccordionPanels();
  }
});
initColorPicker();
if (tabsWrapper) {
  new ResizeObserver(() => {
    updateOverflow();
  }).observe(tabsWrapper);
}
new ResizeObserver(() => {
  syncShellLayout();
}).observe(document.getElementById('chrome'));
applyTheme(currentTheme); applyLang(currentLang);
window.vxchat.subscribe(render); window.vxchat.preferences(applyPreferences);
if (window.vxchat.dismiss) window.vxchat.dismiss(() => closeAllAccordionPanels());
if (window.vxchat.downloads && downloadTracker) window.vxchat.downloads(records => downloadTracker.update(records));
// Only theme/language from the old local shell are eligible for one-time migration.
let legacy = {};
try { legacy = { theme: localStorage.getItem('vxchat_theme'), language: localStorage.getItem('vxchat_lang') }; } catch {}
void command({ action: 'preferences_migrate', patch: legacy });
void command({ action: 'state' });
