return (async () => {
  const root = Zotero.__ztts100;
  if (!root?.pdf?.itemID) throw new Error('issue-100 fixture state is missing');
  const slot = root.pdf;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let openError = null;
  let openPromise = null;
  try { openPromise = Zotero.Reader.open(slot.itemID, null, { openInBackground: true, allowDuplicate: false }); }
  catch (e) { openError = String(e); }
  if (openPromise && typeof openPromise.then === 'function') {
    Promise.resolve(openPromise).catch(e => { openError = String(e); });
  }
  for (let i = 0; i < 160; i++) {
    slot.reader = (Zotero.Reader._readers ?? []).find(r => r?.itemID === slot.itemID) ?? slot.reader;
    if (slot.reader?._internalReader && slot.reader?._internalReader?._readAloudManager) break;
    await sleep(50);
  }
  if (!slot.reader) return JSON.stringify({ fixture: 'pdf', itemID: slot.itemID, reader: false, openError });
  const manager = slot.reader._internalReader?._readAloudManager;
  const view = slot.reader._internalReader?._primaryView;
  const controller = manager?._controller;
  return JSON.stringify({ fixture: 'pdf', itemID: slot.itemID, reader: true, openError, tabID: slot.reader.tabID, manager: !!manager, view: !!view, controller: !!controller, active: !!manager?.active, paused: !!manager?.paused, selected: manager?.selectedVoiceID ?? null, tier: manager?._selectedTier ?? null, position: Number.isFinite(controller?._position) ? controller._position : null });
})()
