return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const h = state.helpers;
  const fixtures = state.fixtures || {};
  if (!h || !Object.keys(fixtures).length) return JSON.stringify({ error: 'helpers or fixtures missing' });
  const out = [];
  const openOne = async (kind, flow) => {
    const slot = fixtures[kind];
    let reader = h.reader(slot), openError = null;
    if (!reader) {
      try {
        const promise = Zotero.Reader.open(slot.itemID, null, { openInBackground: kind === 'pdf', allowDuplicate: false });
        if (promise?.catch) promise.catch(e => { openError = String(e); });
      } catch (e) { openError = String(e); }
    }
    for (let i = 0; i < 240; i++) {
      reader = h.reader(slot);
      if (reader?._internalReader?._primaryView?._iframeWindow && reader?._internalReader?._readAloudManager) break;
      await h.sleep(50);
    }
    if (!reader?._internalReader) { out.push({ kind, flow, reader: false, openError }); return; }
    const view = h.view(slot);
    let flowError = null;
    if (flow) {
      try {
        for (let i = 0; i < 100 && !view?.pageMapping?.ranges; i++) await h.sleep(100);
        await view.setFlowMode(flow);
      } catch (e) { flowError = String(e); }
      if (view?.flowMode !== flow) {
        try { await h.sleep(300); await view.setFlowMode(flow); } catch (e) { flowError = flowError || String(e); }
      }
      await h.sleep(700);
    }
    const internal = reader._internalReader;
    out.push({ kind, flow, reader: true, itemID: slot.itemID, key: slot.key, tabID: reader.tabID, flowActual: view?.flowMode ?? null,
      flowError, initialized: !!view?.initialized, pageMapping: !!view?.pageMapping, ranges: !!view?.pageMapping?.ranges,
      manager: !!internal._readAloudManager, segments: internal._readAloudSegments?.segments?.length || 0 });
  };
  await openOne('pdf', null);
  await openOne('epubScrolled', 'scrolled');
  await openOne('epubPaginated', 'paginated');
  return JSON.stringify({ out });
})()
