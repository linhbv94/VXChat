'use strict';
(() => {
  const root = document.getElementById('updates-controller'); if (!root) return;
  let language = 'vi'; let theme = 'system'; let state = {state:'idle',version:null}; const notice = root.dataset.notice === 'true';
  const invoke = async action => { const result = await window.vxchat.command({action}); if (result.ok && result.update) { state = result.update; render(); } };
  function render() {
    const en = language === 'en'; document.documentElement.lang = language;
    root.dataset.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    const copy = en ? {
      idle:'Check for updates', checking:'Checking for updates…', current:'You are up to date.', available:`Version ${state.version} is available.`, ready:'The update is downloaded.', downloading:Number.isFinite(state.percent) ? `Downloading update: ${Math.round(state.percent)}%` : 'Downloading update…', verifying:'Verifying and staging update…', restarting:'Handing off and restarting…', error:'Could not update.', unsupported:'Updates are available in signed release builds.',
      detail:'The app will download, install and restart. Finish your current work before updating.', busy:'Finish active calls, sign-in windows and downloads before retrying.', check:'Check again', install:'↓ Update & restart',retry:'Retry',dismiss:'Later'
    } : {
      idle:'Kiểm tra cập nhật', checking:'Đang kiểm tra cập nhật…', current:'Bạn đang dùng bản mới nhất.', available:`Có phiên bản mới v${state.version}.`, ready:'Đã tải bản cập nhật.', downloading:Number.isFinite(state.percent) ? `Đang tải cập nhật: ${Math.round(state.percent)}%` : 'Đang tải cập nhật…', verifying:'Đang xác minh và chuẩn bị cập nhật…', restarting:'Đang bàn giao và khởi động lại…', error:'Chưa cập nhật được.', unsupported:'Cập nhật tự động có trong bản release đã ký.',
      detail:'Ứng dụng sẽ tải, cài đặt và khởi động lại. Hãy hoàn tất thao tác đang làm trước khi cập nhật.',busy:'Hoàn tất cuộc gọi, cửa sổ đăng nhập và tải file trước khi thử lại.',check:'Kiểm tra lại',install:'↓ Cập nhật & khởi động lại',retry:'Thử lại',dismiss:'Để sau'
    };
    root.replaceChildren(); const heading = document.createElement('h3'); heading.textContent = copy[state.state] || copy.error; root.append(heading);
    const detail = document.createElement('p'); detail.textContent = state.requires_restart ? (en ? 'The installer outcome is not confirmed. Quit and reopen VXChat to check it; another installer will not be started.' : 'Chưa xác nhận được kết quả cài. Thoát và mở lại VXChat để kiểm tra; app sẽ không chạy thêm installer.') : state.error === 'busy' ? copy.busy : state.previous_attempt === 'restart_unconfirmed' ? (en ? 'The previous update did not restart into the requested version. You can retry after checking for updates.' : 'Lần cập nhật trước chưa mở được đúng phiên bản. Kiểm tra bản mới rồi thử lại.') : state.version ? copy.detail : ''; root.append(detail);
    if (['downloading','verifying','restarting'].includes(state.state)) { const progress = document.createElement('progress'); progress.max = 100; if (state.state === 'downloading' && Number.isFinite(state.percent)) progress.value = state.percent; root.append(progress); }
    const busy = ['checking','downloading','verifying','restarting'].includes(state.state);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'primary'; button.disabled = busy || state.state === 'unsupported' || state.requires_restart; button.textContent = state.version && !busy ? (state.state === 'error' ? copy.retry : copy.install) : copy.check; button.onclick = () => void invoke(state.version ? 'update_install' : 'update_check'); root.append(button);
    if (notice && !busy) { const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'update-dismiss'; dismiss.textContent = '×'; dismiss.title = copy.dismiss; dismiss.setAttribute('aria-label',copy.dismiss); dismiss.onclick = () => void invoke('update_dismiss'); root.append(dismiss); }
  }
  window.vxchat.updates(value => {state = value; render();});
  const preferences = value => { language = value.language; theme = value.theme; render(); };
  window.vxchat.preferences(preferences); matchMedia('(prefers-color-scheme: dark)').addEventListener('change',render);
  void window.vxchat.command({action:'preferences_get'}).then(result => {if (result.ok) preferences(result.preferences);});
  void invoke('update_state'); render();
  if (notice) new ResizeObserver(() => { const height = Math.max(80,Math.min(220,Math.ceil(root.getBoundingClientRect().height + 16))); void window.vxchat.command({action:'update_layout',height}); }).observe(root);
})();
