return (async () => {
  const reader=(Zotero.Reader._readers??[]).find(r=>r?._instanceID==='oxkx7jxW');
  if(!reader)return JSON.stringify({error:'target-reader-missing'});
  await new Promise(resolve=>setTimeout(resolve,250));
  const doc=reader._iframeWindow?.document;const index=Zotero.Reader._readers.indexOf(reader);
  const popup=doc?.querySelector('.read-aloud-popup');const m=reader._internalReader?._readAloudManager;
  const d=JSON.parse(Zotero.ZoteroTTS.diagnostics.playerExpanded())[index]??null;
  return JSON.stringify({target:{index,instanceID:reader._instanceID,constructor:reader.constructor?.name??null,itemID:reader.itemID,windowType:reader._window?.document?.documentElement?.getAttribute?.('windowtype')??null},popup:{exists:!!popup,expanded:!!popup?.classList.contains('expanded'),ready:!!popup?.hasAttribute('data-ztts-expanded-ready'),visibility:popup?doc.defaultView.getComputedStyle(popup).visibility:null},diagnostic:d,manager:{active:!!m?.active,paused:!!m?.paused,selectedVoiceID:m?.selectedVoiceID??null,selectedTier:m?._selectedTier??null,speed:m?.speed??null},styleTextLength:doc?.getElementById('ztts-player-expanded')?.textContent?.length??null});
})()
