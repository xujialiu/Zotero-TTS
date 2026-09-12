return (async()=>{
  const rr=(Zotero.Reader._readers??[]).find(r=>r&&r.itemID===25417);
  const v=rr._internalReader._primaryView;
  const m=rr._internalReader._readAloudManager;
  const c=v._iframeWindow.document.getElementById('viewerContainer');
  const before={scrollTop:c.scrollTop,diag:JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll())[0]};
  const ticks=[];
  for(let i=0;i<3;i++){
    m._stateChanged();
    await new Promise(r=>setTimeout(r,180));
    const d=JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll())[0];
    ticks.push({i,scrollTop:c.scrollTop,last:d?.last?{reason:d.last.reason,top:d.last.top,issued:d.last.issued}:null});
  }
  return JSON.stringify({before,ticks,delta:ticks.at(-1).scrollTop-before.scrollTop});
})()
