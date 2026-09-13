return (async () => {
  const root = Zotero.__ztts100;
  const slot = root?.epub;
  if (!slot?.itemID) throw new Error('EPUB fixture state is missing');
  let openError = null;
  let openPromise = null;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  try { openPromise = Zotero.Reader.open(slot.itemID, null, { openInBackground: true, allowDuplicate: false }); }
  catch (e) { openError = String(e); }
  if (openPromise && typeof openPromise.then === 'function') Promise.resolve(openPromise).catch(e => { openError = String(e); });
  for (let i = 0; i < 160; i++) {
    slot.reader = (Zotero.Reader._readers ?? []).find(r => r?.itemID === slot.itemID) ?? slot.reader;
    if (slot.reader?._internalReader?._readAloudManager) break;
    await sleep(50);
  }
  if (!slot.reader) return JSON.stringify({ fixture: 'epub', itemID: slot.itemID, reader: false, openError });
  const reader = slot.reader;
  const internal = reader._internalReader;
  const manager = internal?._readAloudManager;
  try { Zotero_Tabs.select(reader.tabID); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (e) {}
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
  let diag = null;
  try { diag = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll()); } catch (e) { diag = { error: String(e) }; }
  let popupOpen = null;
  try { popupOpen = !!internal?._state?.readAloudState?.popupOpen; } catch (e) {}
  return JSON.stringify({ fixture: 'epub', itemID: slot.itemID, openError, popupError, pauseError, popupOpen, tabID: reader.tabID, flow: view?.flowMode ?? null, voices: manager?._allVoices?.length ?? 0, segments: manager?._segments?.length ?? 0, active: !!manager?.active, paused: !!manager?.paused, selected: manager?.selectedVoiceID ?? null, tier: manager?._selectedTier ?? null, position: manager?._controller?._position ?? null, diag });
})()
