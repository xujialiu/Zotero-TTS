return (async () => {
  const p = Zotero.ZoteroTTSRun.params, state = Zotero.ZoteroTTSRun.state;
  const Cu = Components.utils, mw = Zotero.getMainWindow();
  const sleep = ms => new Promise(res => mw.setTimeout(res, ms));
  const file = p.fixturesDir + '/scroll-performance/scroll-performance.epub';
  const item = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID });
  state.fixtureID = item.id;
  await Zotero.Reader.open(item.id);
  let r = null;
  for (let i = 0; i < 45; i++) {
    r = (Zotero.Reader._readers || []).find(x => x.itemID === item.id);
    if (r && r._internalReader && r._internalReader._readAloudManager) break;
    await sleep(300);
  }
  if (!r) throw new Error('fixture reader never appeared');
  let v = Cu.waiveXrays(r._internalReader._lastView || r._internalReader._primaryView);
  // It opens paginated; the fault is on the scrolled DOM view (flow mode is per attachment)
  try { v.setFlowMode('scrolled'); } catch (e) { throw new Error('setFlowMode failed: ' + String(e)); }
  for (let i = 0; i < 30; i++) {
    v = Cu.waiveXrays(r._internalReader._lastView || r._internalReader._primaryView);
    if (v && v.flowMode === 'scrolled' && v.iframeDocument &&
        v.iframeDocument.documentElement.scrollHeight > v.iframeWindow.innerHeight * 3) break;
    await sleep(250);
  }
  const out = { itemID: item.id, flowMode: v.flowMode, initialized: v.initialized,
    docHeight: v.iframeDocument.documentElement.scrollHeight, viewportH: v.iframeWindow.innerHeight };
  out.viewports = +(out.docHeight / out.viewportH).toFixed(1);
  if (out.flowMode !== 'scrolled' || out.viewports < 5) throw new Error('fixture is not a tall scrolled view: ' + JSON.stringify(out));
  return JSON.stringify(out, null, 1);
})()
