return (async () => {
  const id=25429;const reader=(Zotero.Reader._readers??[]).find((r)=>r.itemID===id&&r.tabID),internal=reader?._internalReader,m=reader?._readAloudManager,win=reader?._iframeWindow,doc=win?.document,index=(Zotero.Reader._readers??[]).indexOf(reader);
  const out={id,setup:null,pending:null,released:null,patchRestored:false,error:null};
  try{internal?.toggleReadAloudPopup(false)}catch{}
  const closeStart=Date.now();while(Date.now()-closeStart<2500&&(internal?._state?.readAloudState?.popupOpen||doc?.querySelector('.read-aloud-popup')))await new Promise((resolve)=>setTimeout(resolve,25));
  Services.prefs.setBoolPref('extensions.zotero.zotero-tts.readAloud.openExpanded',true);
  let proto=null,original=null,patched=false;
  try{
    proto=win.HTMLButtonElement?.prototype;
    original=proto?.click;
    if(!proto||typeof original!=='function')throw new Error('reader HTMLButtonElement.prototype.click unavailable');
    const holder={calls:0};
    const blocker=function(...args){let inPopup=false;try{inPopup=!!this.closest?.('.read-aloud-popup')}catch{};if(inPopup){holder.calls++;return undefined}return Reflect.apply(original,this,args)};
    proto.click=blocker;patched=true;
    out.setup={styleInstalled:!!doc?.getElementById('ztts-player-expanded'),pref:Services.prefs.getBoolPref('extensions.zotero.zotero-tts.readAloud.openExpanded')};
    internal.toggleReadAloudPopup(true);
    const start=Date.now();
    while(Date.now()-start<1800){
      const p=doc?.querySelector('.read-aloud-popup');const d=JSON.parse(Zotero.ZoteroTTS.diagnostics.playerExpanded())[index]??null;
      if(p&&d?.pending){let v=null;try{v=doc.defaultView.getComputedStyle(p).visibility}catch{};out.pending={t:Date.now()-start,dom:true,className:p.className,ready:p.hasAttribute('data-ztts-expanded-ready'),expanded:p.classList.contains('expanded'),visibility:v,diag:d,calls:holder.calls};break}
      await new Promise((resolve)=>setTimeout(resolve,10));
    }
    proto.click=original;patched=false;out.patchRestored=true;
    Services.prefs.setBoolPref('extensions.zotero.zotero-tts.readAloud.openExpanded',false);
    await new Promise((resolve)=>setTimeout(resolve,120));
    const p=doc?.querySelector('.read-aloud-popup');let v=null;try{v=p?doc.defaultView.getComputedStyle(p).visibility:null}catch{}
    out.released={pref:false,dom:!!p,className:p?.className??null,ready:!!p?.hasAttribute('data-ztts-expanded-ready'),expanded:!!p?.classList.contains('expanded'),visibility:v,diag:JSON.parse(Zotero.ZoteroTTS.diagnostics.playerExpanded())[index]??null};
  }catch(e){out.error=String(e);try{if(patched)proto.click=original}catch{}}
  finally{try{if(patched)proto.click=original;out.patchRestored=proto?.click===original}catch{}}
  if(m?.active&&!m.paused&&typeof m.togglePaused==='function'){try{m.togglePaused();out.pausedByTest=true}catch{}}
  await new Promise((resolve)=>setTimeout(resolve,80));
  out.after={popupOpen:!!internal?._state?.readAloudState?.popupOpen,active:!!m?.active,paused:!!m?.paused,diag:JSON.parse(Zotero.ZoteroTTS.diagnostics.playerExpanded())[index]??null};
  return JSON.stringify(out);
})()

