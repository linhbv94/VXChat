'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const EXECUTABLE = /\.(?:exe|msi|com|bat|cmd|ps1|sh|command|app|pkg|dmg|lnk|url|webloc|desktop|reg|scr|vbs|js|jar)$/i;
function safeFilename(value) {
  let name = path.win32.basename(path.posix.basename(String(value || 'file'))).replace(/[<>:"/\\|?*\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '_').replace(/[. ]+$/g, '').slice(0, 180);
  if (!name || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `download_${name || 'file'}`;
  return name;
}
function existingDirectory(value) {
  try { return typeof value === 'string' && path.isAbsolute(value) && fs.statSync(value).isDirectory() ? value : null; } catch { return null; }
}
class DownloadRegistry {
  constructor({ shell, directory, changed = () => {}, getPreferences = () => ({ ask_download_location:true }) }) {
    Object.assign(this, { shell, directory, changed, getPreferences }); this.records = new Map(); this.disposed = false; this.lastDirectory = null;
  }
  resolveDialogDirectory(prefs) {
    return existingDirectory(this.lastDirectory) || existingDirectory(prefs.download_directory) || existingDirectory(this.directory) || prefs.download_directory || this.directory;
  }
  syncSavePath(record, item, prefs, remember) {
    const savePath = item.getSavePath?.();
    if (!savePath) return;
    record.name = safeFilename(savePath);
    if (remember && prefs.ask_download_location !== false) {
      const dir = existingDirectory(path.dirname(savePath));
      if (dir) this.lastDirectory = dir;
    }
  }
  track(owner, item) {
    const record = { id: randomUUID(), owner_id: owner.tab.id, service_id: owner.instance.service_id, name: safeFilename(item.getFilename()), status: 'downloading', received: 0, total: 0, file: null, item };
    const prefs = this.getPreferences(); const directory = prefs.download_directory || this.directory;
    if (prefs.ask_download_location !== false) item.setSaveDialogOptions({ defaultPath: path.join(this.resolveDialogDirectory(prefs), record.name) });
    else {
      // Reserve a unique destination; never overwrite an existing user file.
      if (!fs.statSync(directory).isDirectory()) throw new Error('download_missing');
      const ext = path.extname(record.name); const stem = path.basename(record.name, ext);
      let destination = null;
      for (let n = 0; n < 10000; n++) {
        const candidate = path.join(directory, `${stem}${n ? ` (${n})` : ''}${ext}`);
        try { const fd = fs.openSync(candidate,'wx',0o600); fs.closeSync(fd); destination = candidate; break; }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
      }
      if (!destination) throw new Error('download_missing');
      const stat = fs.lstatSync(destination); record.reservation = { path:destination, ino:stat.ino, dev:stat.dev };
      try { item.setSavePath(destination); } catch (error) { this.releaseReservation(record); throw error; }
    }
    this.records.set(record.id, record); owner.downloads.add(item);
    const update = (fromEvent = true) => {
      if (this.disposed) return;
      if (fromEvent) this.syncSavePath(record, item, prefs, true);
      record.received = Math.max(0, Number(item.getReceivedBytes()) || 0); record.total = Math.max(0, Number(item.getTotalBytes()) || 0);
      this.changed();
    };
    const onUpdated = () => update(true);
    item.on('updated', onUpdated);
    item.once('done', (_event, state) => {
      owner.downloads.delete(item); item.removeListener('updated', onUpdated);
      if (this.disposed) { if (state !== 'completed') this.releaseReservation(record); return; }
      if (state !== 'cancelled') this.syncSavePath(record, item, prefs, true);
      record.received = Math.max(0, Number(item.getReceivedBytes()) || 0); record.total = Math.max(0, Number(item.getTotalBytes()) || 0);
      record.status = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'failed';
      record.file = state === 'completed' ? item.getSavePath() : null; record.item = null;
      if (state !== 'completed') this.releaseReservation(record); else record.reservation = null;
      if (record.status === 'completed' && !record.file) record.status = 'failed';
      this.trim(); this.changed();
    });
    update(false); return record.id;
  }
  trim() {
    const completed = [...this.records.values()].filter(r => r.status !== 'downloading');
    for (const record of completed.slice(0, Math.max(0, completed.length - 100))) this.records.delete(record.id);
  }
  releaseReservation(record) {
    const reserved = record.reservation; record.reservation = null; if (!reserved) return;
    try { const stat = fs.lstatSync(reserved.path); if (stat.isFile() && !stat.isSymbolicLink() && stat.ino === reserved.ino && stat.dev === reserved.dev) fs.unlinkSync(reserved.path); } catch {}
  }
  snapshot() {
    return [...this.records.values()].reverse().map(({ id, owner_id, service_id, name, status, received, total }) => ({ id, owner_id, service_id, name, status, received, total }));
  }
  cancel(id) {
    const record = this.records.get(id);
    if (!record?.item || record.status !== 'downloading') throw new Error('download_not_active');
    record.item.cancel(); record.status = 'cancelled'; this.changed();
  }
  completed(id) {
    const record = this.records.get(id);
    if (!record || record.status !== 'completed' || !record.file) throw new Error('download_not_ready');
    let stat;
    try { stat = fs.lstatSync(record.file); } catch { throw new Error('download_missing'); }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('download_missing');
    return record;
  }
  async open(id) {
    const record = this.completed(id);
    if (EXECUTABLE.test(record.file)) throw new Error('blocked_file_type');
    if (await this.shell.openPath(record.file)) throw new Error('open_failed');
  }
  reveal(id) { this.shell.showItemInFolder(this.completed(id).file); }
  clearCompleted() {
    for (const [id, record] of this.records) if (record.status !== 'downloading') this.records.delete(id);
    this.changed();
  }
  dispose() {
    this.disposed = true;
    for (const record of this.records.values()) if (record.item) { try { record.item.cancel(); } catch {} }
    this.records.clear();
  }
}
module.exports = { DownloadRegistry, safeFilename };
