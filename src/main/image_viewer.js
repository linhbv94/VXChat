'use strict';
const { externalWebURL, ownedBlobURL } = require('../core/services');
function imageSource(value, origin) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  return externalWebURL(value)?.href || (ownedBlobURL(value, origin) ? value : null);
}
async function installImageSurface(fit, scale) {
  if (!document.contentType.startsWith('image/')) return false;
  const img = document.querySelector('img');
  if (!img) return false;
  try { await img.decode(); } catch { return false; }
  if (!img.naturalWidth) return false;
  document.body.style.cssText = 'margin:0;min-height:100vh;overflow:auto;background:#202124;';
  img.style.cssText = 'display:block;margin:auto;' + (fit ? 'max-width:100vw;max-height:100vh;object-fit:contain;' : `max-width:none;max-height:none;width:${img.naturalWidth * scale}px;height:${img.naturalHeight * scale}px;`);
  if (!globalThis.__vxchatImagePan) {
    globalThis.__vxchatImagePan = true; let pan = null;
    img.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); pan = { x:e.clientX,y:e.clientY,left:scrollX,top:scrollY }; img.setPointerCapture(e.pointerId); });
    img.addEventListener('pointermove', e => { if (pan) scrollTo(pan.left + pan.x - e.clientX, pan.top + pan.y - e.clientY); });
    const stop = () => { pan = null; }; img.addEventListener('pointerup', stop); img.addEventListener('pointercancel', stop);
  }
  return true;
}
async function readSelectedBlob(value) {
  const url = new URL(value);
  if (url.protocol !== 'blob:' || url.origin !== location.origin) throw new Error('invalid_blob_source');
  const controller = new AbortController();const timer = setTimeout(() => controller.abort(),10000);
  try {
    const response = await fetch(value,{signal:controller.signal});if(!response.ok)throw new Error('blob_unavailable');
    const blob = await response.blob();
    if (blob.size > 32 * 1024 * 1024 || !/^image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon)$/i.test(blob.type)) throw new Error('unsupported_blob_image');
    return await new Promise((resolve,reject) => {const reader = new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reader.onabort=()=>reject(new Error('blob_unavailable'));reader.readAsDataURL(blob);});
  } finally {clearTimeout(timer);}
}
function openImageViewer(owner, source, creator) {
  const url = imageSource(source, creator.getURL());
  if (!url || !owner.live() || creator.isDestroyed()) return;
  const { BrowserWindow } = owner.electron;
  const en = owner.getLanguage() === 'en';
  const win = new BrowserWindow({ width:900, height:700, minWidth:360, minHeight:260, title: en ? 'VXChat — Image' : 'VXChat — Ảnh', show: !process.env.VXCHAT_QA_PROFILE, autoHideMenuBar:true, modal:false, alwaysOnTop:false, webPreferences: { session:owner.session, sandbox:true, contextIsolation:true, nodeIntegration:false, javascript:false, webSecurity:true, webviewTag:false, backgroundThrottling:false } });
  const wc = win.webContents; let loading = true; let fit = true; let scale = 1; let disposed = false; let revision = 0;
  owner.imageViewers.add(win); owner.permissionDeniedContents.add(wc); owner.register(wc, owner);
  const live = () => !disposed && owner.live() && !win.isDestroyed() && !creator.isDestroyed();
  const surface = async () => {
    const current = ++revision;
    try {
      const image = await wc.executeJavaScriptInIsolatedWorld(1025, [{ code:`(${installImageSurface.toString()})(${JSON.stringify(fit)},${scale})` }]);
      if (!live() || current !== revision) return;
      if (!image) throw new Error('not_image');
      loading = false;
    } catch { if (live()) { loading = false; await fail(); } }
  };
  const load = async () => {
    if (!live()) return; loading = true;
    try {
      // A separate browsing instance cannot reliably dereference the creator's
      // blob URL. Read only the explicitly selected image in its origin, with
      // a size/type bound, and transfer it in memory. No bytes go to disk/IPC UI.
      const display = url.startsWith('blob:') ? await creator.executeJavaScriptInIsolatedWorld(1026,[{code:`(${readSelectedBlob.toString()})(${JSON.stringify(url)})`}]) : url;
      if (!live()) return;
      await wc.loadURL(display, { httpReferrer: creator.getURL() });
    } catch (e) { if (live() && e.code !== 'ERR_ABORTED') await fail(); }
  };
  let prompting = false;
  const fail = async () => {
    if (!live() || prompting) return; prompting = true;
    try {
      const { response } = await owner.electron.dialog.showMessageBox(win, { type:'warning', title:'VXChat', message: en ? 'The image could not be opened.' : 'Không mở được ảnh.', detail: en ? 'The source may have expired or require its original page. No browser was opened.' : 'Nguồn ảnh có thể đã hết hạn hoặc cần trang gốc. Ảnh không được tự chuyển sang browser.', buttons: en ? ['Close','Retry'] : ['Đóng','Thử lại'], defaultId:0, cancelId:0 });
      if (!live()) return;
      if (response === 1) void load(); else win.close();
    } finally { prompting = false; }
  };
  wc.setWindowOpenHandler(() => ({ action:'deny' }));
  const navigate = (event, target) => { if (!live() || !loading || !externalWebURL(target)) { event.preventDefault(); if (live() && externalWebURL(target)) void owner.openExternal(target); } };
  wc.on('will-navigate', navigate); wc.on('will-redirect', navigate); wc.on('will-attach-webview', e => e.preventDefault());
  wc.on('page-title-updated', e => e.preventDefault());
  wc.on('did-finish-load', () => { const current = wc.getURL(); if (current && current !== 'about:blank') void surface(); });
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'Escape') { event.preventDefault(); win.close(); return; }
    if (!(input.meta || input.control)) return;
    const key = input.key.toLowerCase();
    if (key === 'w') { event.preventDefault(); win.close(); }
    else if (['+', '=', '-', '0'].includes(key)) { event.preventDefault(); fit = key === '0'; scale = fit ? 1 : Math.max(0.25,Math.min(5,scale * (key === '-' ? 0.8 : 1.25))); void surface(); }
  });
  wc.on('context-menu', (_event, params) => {
    const zoom = amount => { fit = false; scale = Math.max(0.25,Math.min(5,scale * amount)); void surface(); };
    owner.electron.Menu.buildFromTemplate([
      { label: en ? 'Fit to window' : 'Vừa cửa sổ', click: () => { fit = true; scale = 1; void surface(); } },
      { label:'100%', click: () => { fit = false; scale = 1; void surface(); } },
      { label: en ? 'Zoom in' : 'Phóng to', click: () => zoom(1.25) }, { label: en ? 'Zoom out' : 'Thu nhỏ', click: () => zoom(0.8) },
      { type:'separator' }, { label: en ? 'Save image as…' : 'Lưu ảnh thành…', click: () => { if (live()) (url.startsWith('blob:') ? creator : wc).downloadURL(url); } },
      { label: en ? 'Copy image' : 'Sao chép ảnh', enabled:params.hasImageContents, click: () => { if (live()) wc.copyImageAt(params.x,params.y); } },
      { type:'separator' }, { label: en ? 'Close' : 'Đóng', click: () => win.close() }
    ]).popup({ window:win });
  });
  const sourceGone = () => { if (!win.isDestroyed()) win.destroy(); };
  creator.once('destroyed', sourceGone);
  win.once('closed', () => { disposed = true; ++revision; creator.removeListener('destroyed',sourceGone); owner.unregister(wc); owner.permissionDeniedContents.delete(wc); owner.imageViewers.delete(win); });
  void load(); return win;
}
function installContextMenu(owner, wc) {
  if (!owner.electron.Menu) return;
  owner.listen(wc, 'context-menu', (_event, params) => {
    if (!owner.live() || wc.isDestroyed()) return;
    const en = owner.getLanguage() === 'en'; const menu = [];
    const source = params.mediaType === 'image' && imageSource(params.srcURL, wc.getURL());
    const link = externalWebURL(params.linkURL);
    if (source) menu.push(
      { label: en ? 'Open image in separate window' : 'Mở ảnh trong cửa sổ riêng', click: () => openImageViewer(owner,source,wc) },
      { label: en ? 'Save image as…' : 'Lưu ảnh thành…', click: () => { if (owner.live() && !wc.isDestroyed()) wc.downloadURL(source); } },
      { label: en ? 'Copy image' : 'Sao chép ảnh', enabled:params.hasImageContents, click: () => { if (owner.live() && !wc.isDestroyed()) wc.copyImageAt(params.x,params.y); } },
      { label: en ? 'Copy image address' : 'Sao chép địa chỉ ảnh', click: () => { if (owner.live()) owner.electron.clipboard.writeText(source); } }
    );
    if (link) menu.push({ label: en ? 'Open link in browser' : 'Mở liên kết trong trình duyệt', click: () => void owner.openExternal(link.href) });
    if (source && externalWebURL(source)) menu.push({ label: en ? 'Open image in browser' : 'Mở ảnh bằng trình duyệt', click: () => void owner.openExternal(source) });
    if (params.isEditable) menu.push({ type:'separator' }, ...['undo','redo','cut','copy','paste','selectAll'].map(role => ({ role, label: owner.t(role) })));
    else if (params.selectionText) menu.push({ role:'copy',label:owner.t('copy') });
    if (menu.length) owner.electron.Menu.buildFromTemplate(menu).popup({ window: owner.electron.BrowserWindow.fromWebContents(wc) || owner.window });
  });
}
module.exports = { imageSource, openImageViewer, installContextMenu };
