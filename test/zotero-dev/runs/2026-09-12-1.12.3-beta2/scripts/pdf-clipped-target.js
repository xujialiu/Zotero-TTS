return (async()=>{
  const rr=(Zotero.Reader._readers??[]).find(r=>r&&r.itemID===25417);
  const v=rr._internalReader._primaryView;
  const m=rr._internalReader._readAloudManager;
  const c=v._iframeWindow.document.getElementById('viewerContainer');
  c.scrollTo(c.scrollLeft,3130);
  const before={scrollTop:c.scrollTop,diag:JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll())[0]};
  m._stateChanged();
  await new Promise(r=>setTimeout(r,350));
  const after={scrollTop:c.scrollTop,diag:JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll())[0]};
  return JSON.stringify({before,after,target:after.diag?.last});
})()
