'use strict';
const {pathToFileURL}=require('node:url');
// Small local view above provider content. Automatic completion never focuses
// the view, raises the window or steals keyboard input from a chat composer.
class DownloadPanel {
  constructor({window,createView,file,ipc}) {Object.assign(this,{window,createView,file,ipc});this.view=null;this.attached=false;}
  show() {
    if(this.window.isDestroyed())return;
    if(!this.view){
      this.view=this.createView(this.file);
      this.unregister=this.ipc.register(this.view.webContents,'downloads',pathToFileURL(this.file).href,()=>this.hide());
      void this.view.webContents.loadFile(this.file).catch(()=>this.hide());
    }
    if(!this.attached){this.window.contentView.addChildView(this.view);this.attached=true;}
    this.resize();
  }
  toggle(){if(this.attached)this.hide();else this.show();}
  hide(){if(this.attached&&!this.window.isDestroyed())this.window.contentView.removeChildView(this.view);this.attached=false;}
  resize(){
    if(!this.attached||this.window.isDestroyed())return;
    const {width,height}=this.window.getContentBounds(),w=Math.min(400,width-24);
    this.view.setBounds({x:Math.max(0,width-w-12),y:32,width:w,height:Math.min(360,Math.max(0,height-44))});
    this.window.contentView.removeChildView(this.view);this.window.contentView.addChildView(this.view);
  }
  dispose(){this.hide();this.unregister?.();if(this.view&&!this.view.webContents.isDestroyed())this.view.webContents.close({waitForBeforeUnload:false});this.view=null;}
}
module.exports={DownloadPanel};
