'use strict';
const SHAPES = {
  state: [], add: ['service_id'], select: ['tab_id'], close: ['tab_id'], reload: ['tab_id'], home: ['tab_id'], confirm_setup: ['tab_id'], setup_reset: ['tab_id'], app_menu: [], reorder: ['tab_ids'],
  focus_popup: ['tab_id', 'popup_id'], close_popup: ['tab_id', 'popup_id'], settings: [], downloads: [], download_panel: [],
  preferences_get: [], preferences_update: ['patch'], preferences_migrate: ['patch'], preferences_reset: [], metadata: [], repository_open: [], window_close: [],
  permission_list: [], permission_revoke: ['id'], download_list: [], download_cancel: ['id'], download_open: ['id'], download_reveal: ['id'], download_clear: [], layout: ['height'], slack_open: [], download_directory_choose: [], zoom_update: ['instance_id','factor'], update_state:[],update_check:[],update_install:[],update_dismiss:[],update_layout:['height']
};
const ROLES = {
  shell: ['state', 'add', 'select', 'close', 'reload', 'home', 'confirm_setup', 'setup_reset', 'app_menu', 'reorder', 'focus_popup', 'close_popup', 'settings', 'downloads', 'download_panel', 'preferences_get', 'preferences_update', 'preferences_migrate', 'metadata', 'layout'],
  settings: ['preferences_get', 'preferences_update', 'preferences_reset', 'metadata', 'repository_open', 'window_close', 'permission_list', 'permission_revoke', 'slack_open','download_directory_choose','zoom_update','update_state','update_check','update_install','update_dismiss'],
  updates:['preferences_get','update_state','update_check','update_install','update_dismiss','update_layout'],
  downloads: ['preferences_get', 'download_list', 'download_cancel', 'download_open', 'download_reveal', 'download_clear', 'window_close','downloads']
};
function validCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command) || !Object.hasOwn(SHAPES, command.action)) return false;
  const required = SHAPES[command.action];
  if (Object.keys(command).sort().join() !== ['action', ...required].sort().join()) return false;
  return required.every(key => {
    const value = command[key];
    if (key === 'height') return Number.isInteger(value) && value >= 68 && value <= 220;
    if (key === 'factor') return Number.isFinite(value) && value >= 0.5 && value <= 2;
    if (key === 'tab_ids') return Array.isArray(value) && value.length <= 100 && value.every(v => typeof v === 'string' && v.length > 0 && v.length <= 80);
    if (key === 'patch') return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length <= 4 && Object.entries(value).every(([k, v]) => ['service_order','hidden_services'].includes(k) ? Array.isArray(v) && v.length <= 4 && new Set(v).size === v.length && v.every(id => ['messenger','zalo','slack','chatgpt'].includes(id)) && (k !== 'service_order' || v.length === 4) : k === 'ask_download_location' ? typeof v === 'boolean' : ['theme', 'language', 'slack_workspace_url'].includes(k) && (v === null || typeof v === 'string' && v.length <= 2048));
    return typeof value === 'string' && value.length > 0 && value.length <= 80;
  });
}
function trustedShell(event, contents, url) {
  try { return event.sender === contents && event.senderFrame === contents.mainFrame && event.senderFrame.url === url; } catch { return false; }
}
const SAFE_ERRORS = new Set(['invalid_preferences', 'invalid_workspace_url', 'config_write_failed', 'tab_not_found', 'popup_not_found', 'download_not_active', 'download_not_ready', 'download_missing', 'blocked_file_type', 'open_failed', 'permission_not_found', 'invalid_setup']);
function installIPC({ ipcMain, shellContents, shellURL, engine, onSettings = () => {}, dispatch = async () => ({}) }) {
  const clients = new Map([[shellContents, { role: 'shell', url: shellURL }]]);
  ipcMain.handle('vxchat:command', async (event, command) => {
    const client = clients.get(event.sender);
    if (!client || !trustedShell(event, event.sender, client.url) || !validCommand(command) || !ROLES[client.role].includes(command.action)) return { ok: false, error: 'invalid_command' };
    try {
      const { action, tab_id: id } = command;
      if (['add', 'select', 'close', 'reload', 'home', 'reorder'].includes(action)) await engine[action](action === 'add' ? command.service_id : action === 'reorder' ? command.tab_ids : id);
      else if (action === 'confirm_setup' || action === 'setup_reset') await engine.setup(id, action === 'confirm_setup');
      else if (action === 'focus_popup' || action === 'close_popup') await engine.popup(id, command.popup_id, action === 'focus_popup' ? 'focus' : 'close');
      else if (action === 'settings') onSettings();
      else if (action !== 'state') return { ok: true, ...await dispatch(command, client) };
      return { ok: true, state: engine.snapshot() };
    } catch (error) { return { ok: false, error: SAFE_ERRORS.has(error.message) ? error.message : 'command_failed' }; }
  });
  const dispose = () => { clients.clear(); ipcMain.removeHandler('vxchat:command'); };
  dispose.register = (contents, role, url, close) => {
    if (!Object.hasOwn(ROLES, role)) throw new Error('invalid_role');
    clients.set(contents, { role, url, close }); return () => clients.delete(contents);
  };
  dispose.broadcast = (channel, value) => {
    for (const [contents] of clients) if (!contents.isDestroyed()) contents.send(`vxchat:${channel}`, value);
  };
  return dispose;
}
module.exports = { installIPC, validCommand, trustedShell };
