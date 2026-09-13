return (async () => {
  const id=25428;
  const reader=(Zotero.Reader._readers??[]).find((r)=>r.itemID===id&&r.tabID);
  if(!reader) return JSON.stringify({error:'pdf tab reader missing'});
  const internal=reader._internalReader;
  const manager=internal?._readAloudManager;
  const doc=reader._iframeWindow?.document;
  try { if(internal?._state?.readAloudState?.popupOpen) internal.toggleReadAloudPopup(false); } catch {}
  const closeStart=Date.now();
  while(Date.now()-closeStart<3000&&(internal?._state?.readAloudState?.popupOpen||doc?.querySelector('.read-aloud-popup'))) await new Promise((resolve)=>setTimeout(resolve,30));
  try { reader._window?.Zotero_Tabs?.select(reader.tabID,true); } catch {}
  const gate=doc?.getElementById('ztts-player-expanded');
  const result={
    id, enabled:Services.prefs.getBoolPref('extensions.zotero.zotero-tts.readAloud.openExpanded'),
    closedBeforeOpen:!internal?._state?.readAloudState?.popupOpen&&!doc?.querySelector('.read-aloud-popup'),
    styleInstalled:!!gate,styleText:gate?.textContent??null,
    buttonFound:!!doc?.querySelector('#read-aloud'),buttonClicked:false,
    samples:[],firstPopupSample:null,firstVisibleSample:null,visibleBeforeReady:0,visibleSamples:0,
    success:false,pausedByTest:false,error:null
  };
  try { doc?.querySelector('#read-aloud')?.click(); result.buttonClicked=true; } catch(e) { result.error='toolbar click: '+String(e); return JSON.stringify(result); }
  const start=Date.now();
  while(Date.now()-start<3000) {
    const popup=doc?.querySelector('.read-aloud-popup');
    let visibility=null;
    try { visibility=popup?doc.defaultView.getComputedStyle(popup).visibility:null; } catch {}
    const s={t:Date.now()-start,inDom:!!popup,className:popup?.className??null,ready:!!popup?.hasAttribute('data-ztts-expanded-ready'),expanded:!!popup?.classList.contains('expanded'),visibility};
    result.samples.push(s);
    if(s.inDom&&!result.firstPopupSample) result.firstPopupSample=s;
    if(s.inDom&&visibility==='visible'&&!result.firstVisibleSample) result.firstVisibleSample=s;
    if(s.inDom&&visibility==='visible') {
      result.visibleSamples++;
      if(!s.ready||!s.expanded) result.visibleBeforeReady++;
    }
    const d=JSON.parse(Zotero.ZoteroTTS.diagnostics.playerExpanded()).find((x)=>x.itemID===id);
    if(d?.ready&&d?.expanded&&!d?.pending) { result.success=true; result.diag=d; break; }
    await new Promise((resolve)=>setTimeout(resolve,20));
  }
  const beforePause={active:!!manager?.active,paused:!!manager?.paused};
  if(manager?.active&&!manager.paused&&typeof manager.togglePaused==='function'){try{manager.togglePaused();result.pausedByTest=true}catch(e){result.error=(result.error?result.error+'; ':'')+'pause: '+String(e)}}
  await new Promise((resolve)=>setTimeout(resolve,100));
  result.beforePause=beforePause;
  result.afterPause={active:!!manager?.active,paused:!!manager?.paused};
  result.finalSample=result.samples[result.samples.length-1]??null;
  result.sampleCount=result.samples.length;
  if(!result.diag) result.diag=JSON.parse(Zotero.ZoteroTTS.diagnostics.playerExpanded()).find((x)=>x.itemID===id)??null;
  return JSON.stringify(result);
})()

