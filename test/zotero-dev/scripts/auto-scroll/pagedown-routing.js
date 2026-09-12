return (async()=>{
  const rr=(Zotero.Reader._readers??[]).find(r=>r&&r.itemID===25417);
  const v=rr._internalReader._primaryView;
  const pw=v._iframeWindow;
  const rw=rr._iframeWindow;
  const m=rr._internalReader._readAloudManager;
  const c=pw.document.getElementById('viewerContainer');
  const diag=()=>JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll())[0];
  const page=()=>({scrollTop:c?.scrollTop??null,scrollLeft:c?.scrollLeft??null,viewPage:v?._viewState?.pageIndex??null,currentPage:pw?.PDFViewerApplication?.pdfViewer?.currentPageNumber??null,scale:pw?.PDFViewerApplication?.pdfViewer?.currentScale??null});
  const logCount=async()=>String(await Zotero.Debug.get()).split(/\r?\n/).filter(x=>x.includes('[zotero-tts] pdf follow: manual keyboard')).length;
  const chain=(t)=>{const a=[];let n=t;for(let i=0;i<10&&n;i++,n=n.parentNode)a.push({localName:String(n.localName??''),id:String(n.id??''),className:String(n.className?.baseVal??n.className??'').slice(0,80)});return a;};
  const seen=[];const listeners=[];
  const add=(label,target,capture)=>{const f=e=>seen.push({label,eventPhase:e.eventPhase,key:String(e.key),code:String(e.code),isTrusted:!!e.isTrusted,defaultPrevented:!!e.defaultPrevented,target:{localName:String(e.target?.localName??''),id:String(e.target?.id??''),className:String(e.target?.className?.baseVal??e.target?.className??'').slice(0,80),ancestors:chain(e.target)}});target.addEventListener('keydown',f,capture);listeners.push([target,f,capture]);};
  add('pdf-window-capture',pw,true);add('pdf-document-capture',pw.document,true);add('pdf-document-bubble',pw.document,false);add('pdf-window-bubble',pw,false);
  const before={diag:diag(),page:page(),logs:await logCount()};
  Zotero_Tabs.select(rr.tabID);rr.focus?.();pw.focus();
  const tip=Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const K=rw.KeyboardEvent;const ev=(key,code,keyCode)=>new K('',{key,code,keyCode,bubbles:true,cancelable:true});
  tip.beginInputTransactionForTests(pw);
  const ret=[tip.keydown(ev('PageDown','PageDown',34)),tip.keyup(ev('PageDown','PageDown',34))];
  for(const [target,f,capture] of listeners)target.removeEventListener('keydown',f,capture);
  await new Promise(r=>setTimeout(r,700));
  const after={diag:diag(),page:page(),logs:await logCount()};
  return JSON.stringify({before:{following:before.diag.following,reason:before.diag.reason,locked:v._readAloudPositionLocked,manualLogs:before.logs,page:before.page,manager:{active:!!m?.active,paused:!!m?.paused,pos:m?._controller?._position??null}},ret,seen,after:{following:after.diag.following,reason:after.diag.reason,locked:v._readAloudPositionLocked,manualLogs:after.logs,logDelta:after.logs-before.logs,page:after.page,manager:{active:!!m?.active,paused:!!m?.paused,pos:m?._controller?._position??null}}});
})()
