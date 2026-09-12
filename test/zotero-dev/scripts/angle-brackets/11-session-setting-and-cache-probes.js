(async () => {
  const list=Zotero.Reader._readers||[]; let reader=null;
  for(let i=0;i<list.length;i++)if(list[i].itemID===25431)reader=list[i];
  if(!reader)return JSON.stringify({error:'fixture reader missing'});
  const internal=reader._internalReader; const manager=internal&&internal._readAloudManager;
  let error=null; try{internal.toggleReadAloudPopup(false)}catch(e){error=String(e)}
  for(let i=0;i<20&&manager&&manager.active;i++)await new Promise(resolve=>setTimeout(resolve,100));
  return JSON.stringify({error,active:!!manager?.active,paused:manager?!!manager.paused:null,popupOpen:!!internal?._readAloudPopupOpen,selectedVoiceID:manager?.selectedVoiceID||null});
})()
