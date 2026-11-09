'use strict';
const { SERVICES } = require('../core/services');
const SERVICE_IDS = Object.keys(SERVICES);
const SHAPES = {
  state: [], add: ['service_id'], select: ['tab_id'], close: ['tab_id'], reload: ['tab_id'], home: ['tab_id'], confirm_setup: ['tab_id'], setup_reset: ['tab_id'], app_menu: [], reorder: ['tab_ids'],
  focus_popup: ['tab_id', 'popup_id'], close_popup: ['tab_id', 'popup_id'], settings: [], downloads: [], download_panel: [], download_panel_hide: [],
  preferences_get: [], preferences_update: ['patch'], preferences_migrate: ['patch'], preferences_reset: [], metadata: [], repository_open: [], window_close: [],
  permission_list: [], permission_revoke: ['id'], download_list: [], download_cancel: ['id'], download_open: ['id'], download_reveal: ['id'], download_clear: [], layout: ['height'], slack_open: [], download_directory_choose: [], zoom_update: ['instance_id','factor'], update_state:[],update_check:[],update_install:[],update_dismiss:[],update_layout:['height'],
  account_create: ['color', 'label', 'service_id'], account_update: ['color', 'label', 'profile_id'], account_delete: ['profile_id'], instance_open: ['instance_id']
};
const ROLES = {
  shell: ['state', 'add', 'select', 'close', 'reload', 'home', 'confirm_setup', 'setup_reset', 'app_menu', 'reorder', 'focus_popup', 'close_popup', 'settings', 'downloads', 'download_panel', 'download_panel_hide', 'preferences_get', 'preferences_update', 'preferences_migrate', 'metadata', 'layout', 'account_create', 'account_update', 'account_delete', 'instance_open'],
  settings: ['preferences_get', 'preferences_update', 'preferences_reset', 'metadata', 'repository_open', 'window_close', 'permission_list', 'permission_revoke', 'slack_open','download_directory_choose','zoom_update','update_state','update_check','update_install','update_dismiss', 'account_create', 'account_update', 'account_delete', 'instance_open'],
  updates:['preferences_get','update_state','update_check','update_install','update_dismiss','update_layout'],
  downloads: ['preferences_get', 'download_list', 'download_cancel', 'download_open', 'download_reveal', 'download_clear', 'window_close','downloads']
};
function validCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command) || !Object.hasOwn(SHAPES, command.action)) return false;
  const required = SHAPES[command.action];
  const keys = Object.keys(command).sort();
  const baseKeys = ['action', ...required].sort();
  if (command.action === 'layout') {
    const withContentTop = ['action', 'content_top', ...required].sort();
    if (keys.join() !== baseKeys.join() && keys.join() !== withContentTop.join()) return false;
    if (command.content_top !== undefined && (!Number.isInteger(command.content_top) || command.content_top < 68 || command.content_top > 520)) return false;
  } else if (keys.join() !== baseKeys.join()) {
    return false;
  }
  return required.every(key => {
    const value = command[key];
    if (key === 'height') return Number.isInteger(value) && value >= 68 && value <= 520;
    if (key === 'factor') return Number.isFinite(value) && value >= 0.5 && value <= 2;
    if (key === 'tab_ids') return Array.isArray(value) && value.length <= 100 && value.every(v => typeof v === 'string' && v.length > 0 && v.length <= 80);
    if (key === 'patch') return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length <= 4 && Object.entries(value).every(([k, v]) => ['service_order','hidden_services'].includes(k) ? Array.isArray(v) && v.length <= SERVICE_IDS.length && new Set(v).size === v.length && v.every(id => SERVICE_IDS.includes(id)) && (k !== 'service_order' || v.length === SERVICE_IDS.length) : k === 'ask_download_location' ? typeof v === 'boolean' : ['theme', 'language', 'slack_workspace_url'].includes(k) && (v === null || typeof v === 'string' && v.length <= 2048));
    if (key === 'color') return typeof value === 'string' && ['blue', 'emerald', 'amber', 'rose', 'violet', 'cyan', 'orange', 'pink'].includes(value);
    if (key === 'label') return typeof value === 'string' && value.trim().length > 0 && value.length <= 32;
    if (key === 'service_id') return typeof value === 'string' && SERVICE_IDS.includes(value);
    if (['instance_id', 'profile_id'].includes(key)) return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
    return typeof value === 'string' && value.length > 0 && value.length <= 80;
  });
}
function trustedShell(event, contents, url) {
  try { return event.sender === contents && event.senderFrame === contents.mainFrame && event.senderFrame.url === url; } catch { return false; }
}
const SAFE_ERRORS = new Set(['invalid_preferences', 'invalid_workspace_url', 'config_write_failed', 'tab_not_found', 'popup_not_found', 'download_not_active', 'download_not_ready', 'download_missing', 'blocked_file_type', 'open_failed', 'permission_not_found', 'invalid_setup', 'account_not_found', 'cannot_delete_default_profile', 'profile_store_not_available', 'invalid_scope_key', 'invalid_profile_label', 'invalid_profile_color', 'unknown_instance', 'profile_recovery_required']);
function installIPC({ ipcMain, shellContents, shellURL, engine, onSettings = () => {}, dispatch = async () => ({}) }) {
  const clients = new Map([[shellContents, { role: 'shell', url: shellURL }]]);
  ipcMain.handle('vxchat:command', async (event, command) => {
    const client = clients.get(event.sender);
    if (!client || !trustedShell(event, event.sender, client.url) || !validCommand(command) || !ROLES[client.role].includes(command.action)) return { ok: false, error: 'invalid_command' };
    try {
      const { action, tab_id: id } = command;
      if (['add', 'select', 'close', 'reload', 'home', 'reorder'].includes(action)) await engine[action](action === 'add' ? command.service_id : action === 'reorder' ? command.tab_ids : id);
      else if (action === 'instance_open') await engine.add(engine.state.instances.find(i => i.id === command.instance_id)?.service_id, command.instance_id);
      else if (action === 'account_create') return { ok: true, ...await engine.createAccount(command), state: engine.snapshot() };
      else if (action === 'account_update') return { ok: true, ...await engine.updateAccount(command.profile_id, command), state: engine.snapshot() };
      else if (action === 'account_delete') return { ok: true, ...await engine.deleteAccount(command.profile_id), state: engine.snapshot() };
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
