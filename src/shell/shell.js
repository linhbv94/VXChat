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
  meet: 'M12,16c-2.76,0-5,2.24-5,5v22c0,2.76,2.24,5,5,5h24c2.76,0,5-2.24,5-5v-5.5l11.2,7.47c1.66,1.1,3.8-.09,3.8-2.08v-21.78c0-1.99-2.14-3.18-3.8-2.08l-11.2,7.47v-5.5c0-2.76-2.24-5-5-5H12Z'
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
const statusText = document.getElementById('status');
const reloadBtn = document.getElementById('reload');
const settingsBtn = document.getElementById('settings-btn');

let current = null;
let currentTheme = 'system';
let currentLang = 'vi';
let draggedServiceId = null;
let serviceOrder = ['messenger','zalo','slack','chatgpt','gmail','gemini','meet'];
let hiddenServices = [];
const PLACEHOLDER_PLUS = { messenger: 'Messenger', gmail: 'Gmail', gemini: 'Gemini', meet: 'Google Meet' };

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
document.getElementById('manage-services').onclick=()=>{
  const panel=document.getElementById('service-manager');panel.hidden=!panel.hidden;
  document.getElementById('manage-services').setAttribute('aria-expanded',String(!panel.hidden));renderServiceManager();
};
document.getElementById('service-manager').onkeydown=event=>{
  if(event.key==='Escape'){document.getElementById('service-manager').hidden=true;const button=document.getElementById('manage-services');button.setAttribute('aria-expanded','false');button.focus();}
};
function moveService(source,target,after){
  const order=window.vxchatTabOrder(serviceOrder,source,target,after);
  if(order) void command({action:'preferences_update',patch:{service_order:order}});
}
function tabButton(tab){
  const active=tab.id===current.active_tab_id,element=document.createElement('div');element.className='tab';element.dataset.tabId=tab.id;
  element.setAttribute('role','tab');element.setAttribute('aria-selected',String(active));element.tabIndex=0;
  element.classList.toggle('is-active',active);element.classList.toggle('is-loading',tab.status==='loading');element.classList.toggle('is-error',tab.status==='error');
  const icon=createIcon(tab.service_id);if(icon)element.append(icon);
  const indicator=document.createElement('span');indicator.className='tab-indicator';element.append(indicator);
  const title=document.createElement('span');title.className='tab-title';title.textContent=tab.label;element.append(title);
  element.onclick=()=>command({action:'select',tab_id:tab.id});
  const close=document.createElement('button');close.type='button';close.className='tab-close';close.textContent='×';close.setAttribute('aria-label',`${t('closeTab')} ${tab.label}`);
  close.onclick=event=>{event.stopPropagation();void command({action:'close',tab_id:tab.id});};element.append(close);
  element.onkeydown=event=>{
    if(event.target!==element||event.altKey)return;
    if(['Enter',' '].includes(event.key)){event.preventDefault();void command({action:'select',tab_id:tab.id});}
    if(['Delete','Backspace'].includes(event.key)){event.preventDefault();void command({action:'close',tab_id:tab.id});}
    if(['ArrowLeft','ArrowRight'].includes(event.key)){
      const tabs=[...tabsList.querySelectorAll('[role="tab"]')],next=tabs[tabs.indexOf(element)+(event.key==='ArrowRight'?1:-1)];
      if(next){event.preventDefault();next.focus();void command({action:'select',tab_id:next.dataset.tabId});}
    }
  };return element;
}
function render(state){
  if(!state)return;current=state;if(draggedServiceId)return;
  const focus=document.activeElement,focusTab=focus?.closest('.tab')?.dataset.tabId,focusService=focus?.closest('.service-group')?.dataset.serviceId,focusPlus=focus?.dataset.addService;
  tabsList.replaceChildren();
  for(const id of serviceOrder.filter(id=>!hiddenServices.includes(id))){
    const definition=state.services?.find(item=>item.id===id);if(!definition)continue;
    const tabs=state.tabs.filter(tab=>tab.service_id===id),group=document.createElement('div');group.className='service-group';group.dataset.serviceId=id;group.draggable=true;
    let primary;
    if(tabs.length)primary=tabButton(tabs[0]);
    else{
      primary=document.createElement('button');primary.type='button';primary.className='tab service-launch is-unopened';
      const icon=createIcon(id);if(icon)primary.append(icon);
      const label=document.createElement('span');label.className='tab-title';label.textContent=definition.label;primary.append(label);
      primary.onclick=()=>command({action:'add',service_id:id});
    }
    primary.dataset.launchService=id;primary.title=`${definition.label} · ${currentLang==='en'?(tabs.length?'Open · drag to reorder':'Not open · click to open'):(tabs.length?'Đang mở · kéo để sắp xếp':'Chưa mở · bấm để mở')}`;group.append(primary);
    for(const tab of tabs.slice(1))group.append(tabButton(tab));
    if(Object.hasOwn(PLACEHOLDER_PLUS,id)||id==='chatgpt'){
      const plus=document.createElement('button');plus.type='button';plus.className='service-plus';plus.textContent='+';plus.dataset.addService=id;
      const acct=PLACEHOLDER_PLUS[id];
      plus.title=acct
        ?(currentLang==='en'?`Add ${acct} account — coming soon`:`Thêm tài khoản ${acct} — chưa hỗ trợ`)
        :(currentLang==='en'?'New ChatGPT tab · same signed-in account':'Mở thêm tab ChatGPT · cùng tài khoản đang đăng nhập');
      plus.setAttribute('aria-label',plus.title);
      if(acct){plus.setAttribute('aria-disabled','true');plus.classList.add('is-placeholder');}
      else plus.onclick=()=>command({action:'add',service_id:id});group.append(plus);
    }
    group.onkeydown=event=>{
      if(!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
      const after=event.key==='ArrowRight',target=serviceOrder[serviceOrder.indexOf(id)+(after?1:-1)];
      if(target){event.preventDefault();moveService(id,target,after);}
    };
    group.ondragstart=event=>{draggedServiceId=id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);group.classList.add('is-dragging');};
    group.ondragover=event=>{if(draggedServiceId){event.preventDefault();event.dataTransfer.dropEffect='move';group.classList.add('drag-over');}};
    group.ondragleave=()=>group.classList.remove('drag-over');
    group.ondrop=event=>{
      if(!draggedServiceId)return;event.preventDefault();const source=draggedServiceId;draggedServiceId=null;
      const rect=group.getBoundingClientRect();moveService(source,id,event.clientX>=rect.left+rect.width/2);render(current);
    };
    group.ondragend=()=>{draggedServiceId=null;render(current);};tabsList.append(group);
  }
  const restore=(focusPlus&&tabsList.querySelector(`[data-add-service="${focusPlus}"]`))
    ||(focusTab&&tabsList.querySelector(`[data-tab-id="${focusTab}"]`))
    ||(focusService&&tabsList.querySelector(`[data-launch-service="${focusService}"]`));
  restore?.focus();
  renderServiceManager();renderWorkflow(state);
  const active=state.tabs.find(tab=>tab.id===state.active_tab_id),location=document.getElementById('page-location');location.textContent=active?.location||'';location.title=location.textContent;
  document.getElementById('setup-btn').hidden=active?.service_id!=='messenger';
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
  hiddenServices = value.hidden_services || [];
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
});
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
