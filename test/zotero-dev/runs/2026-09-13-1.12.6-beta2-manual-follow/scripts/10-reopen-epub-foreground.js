return (async () => {
  const root = Zotero.__ztts100;
  const slot = root?.epub;
  if (!slot?.itemID) throw new Error('EPUB fixture state is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let openError = null;
  let openPromise = null;
  try { openPromise = Zotero.Reader.open(slot.itemID, null, { openInBackground: false, allowDuplicate: false }); }
  catch (e) { openError = String(e); }
  if (openPromise && typeof openPromise.then === 'function') Promise.resolve(openPromise).catch(e => { openError = String(e); });
  for (let i = 0; i < 160; i++) {
    slot.reader = (Zotero.Reader._readers ?? []).find(r => r?.itemID === slot.itemID) ?? slot.reader;
    if (slot.reader?._internalReader?._readAloudManager) break;
    await sleep(50);
  }
  if (!slot.reader) return JSON.stringify({ fixture: 'epub', reader: false, openError });
  const reader = slot.reader;
  const internal = reader._internalReader;
  const manager = internal?._readAloudManager;
  let popupError = null;
  try { internal.toggleReadAloudPopup(true); } catch (e) { popupError = String(e); }
  for (let i = 0; i < 160; i++) {
    if (manager?._allVoices?.length && manager?._segments?.length && manager?._controller) break;
    await sleep(50);
  }
  let pauseError = null;
  try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) { pauseError = String(e); }
  await sleep(250);
  const view = internal?._primaryView;
  const waived = Components.utils.waiveXrays(view);
  const helper = Components.utils.waiveXrays(waived?._readAloud);
  const proto = Object.getPrototypeOf(waived);
  let diag = null;
  try { diag = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll()); } catch (e) { diag = { error: String(e) }; }
  return JSON.stringify({ fixture: 'epub', openError, popupError, pauseError, tabID: reader.tabID, flow: view?.flowMode ?? null, initialized: !!view?.initialized, active: !!manager?.active, paused: !!manager?.paused, voices: manager?._allVoices?.length ?? 0, segments: manager?._segments?.length ?? 0, position: manager?._controller?._position ?? null, hooks: { navigateOwn: Object.prototype.hasOwnProperty.call(waived, 'navigate'), navigateSame: waived?.navigate === proto?.navigate, positionLocked: helper?.positionLocked ?? null, scrolling: helper?.scrolling ?? null }, diag: diag.at ? diag.at(-1) : diag });
})()
