return (async () => {
  const id=25428;
  const reader=(Zotero.Reader._readers??[]).find((r)=>r.itemID===id&&r.tabID),internal=reader?._internalReader,doc=reader?._iframeWindow?.document,m=internal?._readAloudManager;
  const index=(Zotero.Reader._readers??[]).indexOf(reader);const state=()=>{const p=doc?.querySelector('.read-aloud-popup');const d=JSON.parse(Zotero.ZoteroTTS.diagnostics.playerExpanded())[index]??null;return {popupOpen:!!internal?._state?.readAloudState?.popupOpen,dom:!!p,className:p?.className??null,ready:!!p?.hasAttribute('data-ztts-expanded-ready'),expanded:!!p?.classList.contains('expanded'),active:!!m?.active,paused:!!m?.paused,diag:d,style:doc?.getElementById('ztts-player-expanded')?.textContent??null}};
  const before=state();Services.prefs.setBoolPref('extensions.zotero.zotero-tts.readAloud.openExpanded',false);await new Promise((resolve)=>setTimeout(resolve,150));const after=state();
  return JSON.stringify({id,before,after,pref:Services.prefs.getBoolPref('extensions.zotero.zotero-tts.readAloud.openExpanded')});
})()

