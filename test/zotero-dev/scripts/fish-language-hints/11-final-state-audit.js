(async () => {
  const p='extensions.zotero.zotero-tts.';
  const keys=['readAloud.volume','webdav.syncPositions','webdav.syncSettings','webdav.autoUploadSettings','readAloud.stripAngleBrackets','cacheAudio','prefetchEnabled','readAloud.memory'];
  const out={prefs:{},readers:[],settingsWindow:!!Services.wm.getMostRecentWindow('zotero:pref'),debugStoring:!!Zotero.Debug.storing,fixtureItems:{}};
  for(const s of keys){const v=Zotero.Prefs.get('zotero-tts.'+s);out.prefs[s]={value:s==='readAloud.memory'?{length:String(v??'').length}:v,user:Services.prefs.prefHasUserValue(p+s)};}
  const list=Zotero.Reader._readers||[];
  for(let i=0;i<list.length;i++){const r=list[i],m=r._internalReader&&r._internalReader._readAloudManager,c=m&&m._controller;let popupDOM=null;try{popupDOM=!!r._window?.document?.querySelector?.('.read-aloud-popup');}catch(e){}out.readers.push({itemID:r.itemID,active:!!m?.active,paused:m?!!m.paused:null,voice:m?.selectedVoiceID??null,position:c?c._position:null,error:c?String(c._lastError??''):null,popupOpen:m?!!m.popupOpen:null,popupDOM});}
  for(const id of [24424,24425,24426,24427,24428]){try{const it=Zotero.Items.get(id);out.fixtureItems[id]=it?{exists:true,title:it.getField?.('title')??null}:false;}catch(e){out.fixtureItems[id]=false;}}
  try{out.tabs={selectedID:Zotero_Tabs.selectedID,selectedIndex:Zotero_Tabs.selectedIndex};}catch(e){out.tabs={error:String(e)};}
  try{out.position=JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());}catch(e){out.position={error:String(e)};}
  return JSON.stringify(out,null,1);
})()
