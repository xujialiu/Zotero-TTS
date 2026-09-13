return (async () => {
  const root = Zotero.__ztts100, slot = root?.epub;
  if (!slot?.itemID) throw new Error('EPUB fixture state missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let openError = null, flowError = null, openPromise = null;
  try { openPromise = Zotero.Reader.open(slot.itemID, null, { openInBackground: false, allowDuplicate: false }); }
  catch (e) { openError = String(e); }
  if (openPromise?.then) Promise.resolve(openPromise).catch(e => { openError = String(e); });
  for (let i = 0; i < 160; i++) {
    slot.reader = (Zotero.Reader._readers ?? []).find(r => r?.itemID === slot.itemID) ?? slot.reader;
    if (slot.reader?._internalReader?._primaryView) break;
    await sleep(50);
  }
  if (!slot.reader) return JSON.stringify({ fixture: 'epub', reader: false, openError, flowError });
  const view = slot.reader._internalReader._primaryView;
  try { await view.setFlowMode('scrolled'); } catch (e) { flowError = String(e); }
  await sleep(800);
  return JSON.stringify({ fixture: 'epub', reader: true, openError, flowError, flow: view.flowMode, initialized: !!view.initialized, tabID: slot.reader.tabID });
})()
