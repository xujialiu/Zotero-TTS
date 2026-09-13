return (async () => {
  const id=25428;
  const reader=(Zotero.Reader._readers??[]).find((r)=>r.itemID===id&&r.tabID);
  const doc=reader?._iframeWindow?.document, internal=reader?._internalReader, manager=internal?._readAloudManager;
  try{reader?._window?.Zotero_Tabs?.select(reader.tabID,true)}catch{}
  const popup=doc?.querySelector('.read-aloud-popup');
  const selector='.read-aloud-popup .row.buttons .group:first-child > button.toolbar-button';
  const button=popup?.querySelector('.row.buttons .group:first-child > button.toolbar-button');
  const before={popupOpen:!!internal?._state?.readAloudState?.popupOpen,dom:!!popup,className:popup?.className??null,ready:!!popup?.hasAttribute('data-ztts-expanded-ready'),expanded:!!popup?.classList.contains('expanded'),button:!!button,active:!!manager?.active,paused:!!manager?.paused};
  let clicked=false,error=null;
  try{button?.click();clicked=!!button}catch(e){error=String(e)}
  await new Promise((resolve)=>setTimeout(resolve,180));
  const afterPopup=doc?.querySelector('.read-aloud-popup');
  const diag=JSON.parse(Zotero.ZoteroTTS.diagnostics.playerExpanded());
  const index=(Zotero.Reader._readers??[]).indexOf(reader);
  return JSON.stringify({id,selector,before,clicked,error,after:{popupOpen:!!internal?._state?.readAloudState?.popupOpen,dom:!!afterPopup,className:afterPopup?.className??null,ready:!!afterPopup?.hasAttribute('data-ztts-expanded-ready'),expanded:!!afterPopup?.classList.contains('expanded'),active:!!manager?.active,paused:!!manager?.paused},diag:diag[index]??null});
})()

