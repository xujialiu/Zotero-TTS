return (async () => {
  const itemID=25430;
  const targetIDs=['7mAE7agJ','oxkx7jxW'];
  const rs=Zotero.Reader._readers??[];
  const targets=rs.filter(r=>r&&targetIDs.includes(r._instanceID)&&r.itemID===itemID);
  const before=targets.map(r=>({instanceID:r._instanceID,constructor:r.constructor?.name??null,tabID:r.tabID??null,popupOpen:!!r._internalReader?.popupOpen,active:!!r._internalReader?._readAloudManager?.active,paused:!!r._internalReader?._readAloudManager?.paused,style:!!r._iframeWindow?.document?.getElementById('ztts-player-expanded'),popup:!!r._iframeWindow?.document?.querySelector('.read-aloud-popup')}));
  for(const r of targets){
    try{if(r._internalReader?.popupOpen||r._iframeWindow?.document?.querySelector('.read-aloud-popup'))r._internalReader.toggleReadAloudPopup(false);}catch{}
  }
  await new Promise(resolve=>setTimeout(resolve,100));
  for(const r of [...targets]){
    try{await Promise.resolve(r.close());}catch{}
  }
  const deadline=Date.now()+6000;
  while(Date.now()<deadline){
    const left=(Zotero.Reader._readers??[]).filter(r=>r&&targetIDs.includes(r._instanceID));
    if(!left.length)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const remainingReaders=(Zotero.Reader._readers??[]).filter(r=>r&&targetIDs.includes(r._instanceID)).map(r=>({instanceID:r._instanceID,itemID:r.itemID}));
  let erased=false;let eraseError=null;
  const item=Zotero.Items.get(itemID);
  if(item){try{await item.eraseTx();erased=true;}catch(e){eraseError=String(e);}}
  await new Promise(resolve=>setTimeout(resolve,250));
  const pos=JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const pref='extensions.zotero.zotero-tts.readAloud.openExpanded';
  const prefBefore={effective:Services.prefs.getBoolPref(pref),hasUserValue:Services.prefs.prefHasUserValue(pref)};
  Services.prefs.clearUserPref(pref);
  const prefAfter={effective:Services.prefs.getBoolPref(pref),hasUserValue:Services.prefs.prefHasUserValue(pref)};
  const leftovers=(Zotero.Reader._readers??[]).filter(r=>r&&r.itemID===itemID).map(r=>({instanceID:r._instanceID,constructor:r.constructor?.name??null}));
  return JSON.stringify({before,targetIDs,remainingReaders,erased,eraseError,positionRows:pos.database?.rows??null,fixtureReaderLeftovers:leftovers,prefBefore,prefAfter});
})()
