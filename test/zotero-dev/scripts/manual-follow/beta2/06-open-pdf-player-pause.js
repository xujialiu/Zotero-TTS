return (async () => {
  const root = Zotero.__ztts100;
  const slot = root?.pdf;
  if (!slot?.reader) throw new Error('PDF reader is missing');
  const reader = slot.reader;
  const internal = reader._internalReader;
  const manager = internal?._readAloudManager;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
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
  let diag = null;
  try { diag = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll()); } catch (e) { diag = { error: String(e) }; }
  let popupOpen = null;
  try { popupOpen = !!internal?._state?.readAloudState?.popupOpen; } catch (e) {}
  return JSON.stringify({ fixture: 'pdf', popupError, pauseError, popupOpen, voices: manager?._allVoices?.length ?? 0, segments: manager?._segments?.length ?? 0, active: !!manager?.active, paused: !!manager?.paused, selected: manager?.selectedVoiceID ?? null, tier: manager?._selectedTier ?? null, position: manager?._controller?._position ?? null, diag });
})()
