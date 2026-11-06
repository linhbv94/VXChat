'use strict';
let language = 'vi'; let records = [];
const dict = {
  vi: { title: 'Tệp đã tải', clear: 'Xóa danh sách đã xong', close: 'Đóng', empty: 'Chưa có tệp tải trong phiên này.', downloading: 'Đang tải', completed: 'Đã tải', cancelled: 'Đã hủy', failed: 'Tải thất bại', open: 'Mở', reveal: 'Hiện trong thư mục', cancel: 'Hủy', error: 'Không thực hiện được thao tác; tệp có thể đã bị di chuyển hoặc xóa.', blocked: 'Dùng “Hiện trong thư mục” để kiểm tra và mở tệp này.' },
  en: { title: 'Downloads', clear: 'Clear finished items', close: 'Close', empty: 'No downloads in this session.', downloading: 'Downloading', completed: 'Completed', cancelled: 'Cancelled', failed: 'Failed', open: 'Open', reveal: 'Show in folder', cancel: 'Cancel', error: 'Operation failed; the file may have moved or been deleted.', blocked: 'Use “Show in folder” to review and open this file.' }
};
function render() {
  const d = dict[language]; for (const id of ['title', 'clear', 'close']) document.getElementById(id).textContent = d[id];
  const list = document.getElementById('list');
  // Preserve keyboard focus during frequent download progress updates.
  const focused = document.activeElement; const key = focused?.dataset.download; const action = focused?.dataset.action;
  list.replaceChildren(); if (!records.length) list.textContent = d.empty;
  for (const record of records) {
    const row = document.createElement('article'); row.className = 'download';
    const label = document.createElement('strong'); label.textContent = record.name;
    const status = document.createElement('p'); status.textContent = `${d[record.status]} · ${(record.received / 1048576).toFixed(1)} / ${record.total ? (record.total / 1048576).toFixed(1) : '?'} MB`;
    row.append(label, status);
    if (record.status === 'downloading') { const progress = document.createElement('progress'); if (record.total) { progress.max = record.total; progress.value = record.received; } row.append(progress); }
    const actions = record.status === 'downloading' ? ['cancel'] : record.status === 'completed' ? ['open', 'reveal'] : [];
    for (const verb of actions) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = d[verb]; button.dataset.download = record.id; button.dataset.action = verb;
      button.onclick = () => command({ action: `download_${verb}`, id: record.id }); row.append(button);
    }
    list.append(row);
  }
  if (key && action) [...list.querySelectorAll('button')].find(el => el.dataset.download === key && el.dataset.action === action)?.focus();
}
async function command(value) {
  try {
    const result = await window.vxchat.command(value); if (!result.ok) throw new Error(result.error);
    document.getElementById('error').textContent = '';
    if (result.downloads) { records = result.downloads; render(); }
    if (result.preferences) applyPreferences(result.preferences);
  } catch (error) { document.getElementById('error').textContent = dict[language][error.message === 'blocked_file_type' ? 'blocked' : 'error']; }
}
function applyPreferences(value) {
  language = value.language; document.documentElement.lang = language;
  if (value.theme === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = value.theme;
  render();
}
document.getElementById('clear').onclick = () => command({ action: 'download_clear' });
document.getElementById('close').onclick = () => command({ action: 'window_close' });
window.addEventListener('keydown', event => { if (event.key === 'Escape') void command({ action: 'window_close' }); });
window.vxchat.downloads(value => { records = value; render(); }); window.vxchat.preferences(applyPreferences);
void command({ action: 'preferences_get' }); void command({ action: 'download_list' });
