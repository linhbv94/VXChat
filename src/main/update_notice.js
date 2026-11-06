'use strict';
const { pathToFileURL } = require('node:url');
class UpdateNotice {
  constructor({ window, view, file, ipc }) {
    Object.assign(this,{window,view}); this.attached = false; this.height = 190;
    view.setBackgroundColor('#00000000');
    this.unregister = ipc.register(view.webContents,'updates',pathToFileURL(file).href);
    void view.webContents.loadFile(file).catch(() => {});
  }
  sync(state) {
    const show = !state.dismissed && !!state.version && ['available','ready','downloading','verifying','restarting','error'].includes(state.state);
    if (this.window.isDestroyed()) return;
    if (show && !this.attached) { this.window.contentView.addChildView(this.view); this.attached = true; }
    else if (!show && this.attached) { this.window.contentView.removeChildView(this.view); this.attached = false; }
    this.resize();
  }
  resize(height) {
    if (height) this.height = height;
    if (!this.attached || this.window.isDestroyed()) return;
    const {width,height:available} = this.window.getContentBounds(); const w = Math.min(400,width - 24);
    this.view.setBounds({x:Math.max(0,width - w - 12),y:Math.max(0,available - this.height - 12),width:w,height:this.height});
    // Service switching can append a new content view. Keep this small notice
    // above it without covering any area outside its actual native bounds.
    this.window.contentView.removeChildView(this.view); this.window.contentView.addChildView(this.view);
  }
  dispose() { this.unregister(); if (!this.view.webContents.isDestroyed()) this.view.webContents.close({waitForBeforeUnload:false}); }
}
module.exports = { UpdateNotice };
