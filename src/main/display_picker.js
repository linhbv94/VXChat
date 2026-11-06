'use strict';
const { text } = require('./messages');
function createDisplayPicker({ desktopCapturer, Menu, window, getLanguage = () => 'vi' }) {
  return async ({ signal } = {}) => {
    if (signal?.aborted) return null;
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
    if (!sources.length || window.isDestroyed() || signal?.aborted) return null;
    return new Promise(resolve => {
      let settled = false; let menu;
      const finish = source => { if (settled) return; settled = true; signal?.removeEventListener('abort', abort); resolve(source); };
      const abort = () => { finish(null); menu?.closePopup(window); };
      const t = key => text(getLanguage(), key);
      menu = Menu.buildFromTemplate([
        { label: t('source'), enabled: false },
        ...sources.map(source => ({ label: `[${t(source.id.startsWith('screen:') ? 'screen' : 'window')}] ${source.name.replace(/[\r\n]/g, ' ').replace(/&/g, '&&')}`, click: () => finish(source) })),
        { type: 'separator' }, { label: t('cancel'), click: () => finish(null) }
      ]);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      menu.popup({ window, callback: () => finish(null) });
    });
  };
}
module.exports = { createDisplayPicker };
