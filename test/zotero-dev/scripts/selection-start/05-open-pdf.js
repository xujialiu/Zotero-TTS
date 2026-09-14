return (async () => {
  const slot = Zotero.ZoteroTTSRun.state.fixtures?.pdf;
  if (!slot?.itemID) throw new Error('PDF fixture is missing');
  let reader = (Zotero.Reader._readers || []).find(r => r?.itemID === slot.itemID) || null;
  let openError = null;
  if (!reader) {
    try {
      const promise = Zotero.Reader.open(slot.itemID, null, { openInBackground: false, allowDuplicate: false });
      if (promise?.catch) promise.catch(e => { openError = String(e); });
    } catch (e) { openError = String(e); }
  }
  for (let i = 0; i < 240; i++) {
    reader ||= (Zotero.Reader._readers || []).find(r => r?.itemID === slot.itemID) || null;
    if (reader?._internalReader?._primaryView?._iframeWindow && reader?._internalReader?._readAloudManager) break;
    await new Promise(r => setTimeout(r, 50));
  }
  if (!reader?._internalReader) throw new Error('PDF reader did not become ready: ' + (openError || 'timeout'));
  slot.reader = reader;
  const ir = reader._internalReader;
  const view = ir._primaryView;
  const segments = ir._readAloudSegments?.segments || [];
  return JSON.stringify({ itemID: slot.itemID, key: slot.key, tabID: reader.tabID, view: view?.constructor?.name || null, manager: !!ir._readAloudManager, segments: segments.length, flow: view?.flowMode ?? null, openError });
})()
