// Item 9's last bullet and 4.10's "a voice without word timing" bullet,
// run once. Uses the EPUB reader (its cache already has this voice's
// audio from issue #73's original run) switched to
// azure::en-US-Ethan:MAI-Voice-2, Word started OFF so the press turns it
// ON and shows the long toast.
//
// selectVoice() alone never took hold on this manager (tried live: a
// string id and the voice object itself, paused and playing --
// selectedVoiceID never moved, no error, no thrown exception). The
// reliable route, as for the run's initial voice pick
// (01-provider-and-voice-prep.js), is Zotero's own per-language
// persisted-voice restore: close the popup, repoint the 'en' entry,
// reopen (sameForAllDocuments is off for this whole run, so this never
// reaches the owner's reader) -- which also means the manager instance is
// replaced, so it is re-read fresh after every reopen rather than cached.
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = Zotero.getMainWindow ? Zotero.getMainWindow() : Services.wm.getMostRecentWindow('navigator:browser');
  const fixtures = Zotero.ZoteroTTSRun.state.fixtures;
  const fullName = (rel) => 'extensions.zotero.' + rel;
  const findReader = () => (Zotero.Reader._readers || []).find((r) => r.itemID === fixtures.epub.itemID);
  const manager = () => findReader()._internalReader._readAloudManager;

  const readerEpub0 = findReader();
  win.Zotero_Tabs.select(readerEpub0.tabID);
  readerEpub0.focus?.();
  win.focus();
  const originalVoiceID = manager().selectedVoiceID;
  const MAI_ID = 'azure::en-US-Ethan:MAI-Voice-2';

  async function pointVoiceAndReopen(voiceID, playMs = 500) {
    const reader = findReader();
    reader._internalReader.toggleReadAloudPopup(false);
    await sleep(400);
    const voices = JSON.parse(Services.prefs.getStringPref(fullName('reader.readAloudVoices'), '{}'));
    voices.en.voice = voiceID;
    voices.en.tierVoices = { ...(voices.en.tierVoices || {}), azure: voiceID };
    Services.prefs.setStringPref(fullName('reader.readAloudVoices'), JSON.stringify(voices));
    win.Zotero_Tabs.select(reader.tabID);
    reader._internalReader.toggleReadAloudPopup(true);
    // Left playing for playMs so a segment/word-timestamp is actually
    // established (a reopen paused within ~500ms never got that far: found
    // live, wordTiming read "none" instead of "stand-in" until given ~1.5s)
    await sleep(playMs);
    const m = manager();
    if (m.active && !m.paused) m.togglePaused();
    await sleep(150);
  }

  let selectError = null;
  try {
    await pointVoiceAndReopen(MAI_ID, 1800);
  } catch (e) {
    selectError = String(e);
  }
  const afterSelect = { selectedVoiceID: manager().selectedVoiceID, active: !!manager().active, paused: !!manager().paused };

  const levels = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels());
  const highlightAll = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.highlight());
  const idxEpub = () => (Zotero.Reader._readers || []).findIndex((r) => r.itemID === fixtures.epub.itemID);

  Zotero.Prefs.set('zotero-tts.highlight.word', false);
  Zotero.Prefs.set('zotero-tts.highlight.sentence', true);
  await sleep(150);
  const wordTimingBefore = levels().readers.find((r) => r.itemID === fixtures.epub.itemID)?.wordTiming;
  const beforePress = { switches: levels().switches, wordTiming: wordTimingBefore };

  const readerForPress = findReader();
  win.Zotero_Tabs.select(readerForPress.tabID);
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const ev = (key, code, keyCode, shiftKey = false) => new win.KeyboardEvent('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
  tip.beginInputTransactionForTests(win);
  const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev('W', 'KeyW', 87, true)), tip.keyup(ev('W', 'KeyW', 87, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
  if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();

  const toastEl = () => findReader()._iframeWindow.document.getElementById('ztts-speed-toast');
  const toast0 = { text: toastEl()?.textContent ?? null, opacity: toastEl()?.style?.opacity ?? null };
  await sleep(1000);
  const toast1 = { opacity: toastEl()?.style?.opacity ?? null };
  const viewSnap = highlightAll()[idxEpub()].views[0];
  const stateAfterOn = { switches: levels().switches, granularity: viewSnap.granularity, activeWordTimestamp: viewSnap.activeWordTimestamp, stateHighlightGranularity: viewSnap.state?.highlightGranularity };
  await sleep(3900); // ~4.9s since press
  const toast49 = { opacity: toastEl()?.style?.opacity ?? null };
  await sleep(300); // ~5.2s since press
  const toast52 = { opacity: toastEl()?.style?.opacity ?? null };

  // Restore: Word back on (both on), voice back to ChristopherNeural, same route
  Zotero.Prefs.set('zotero-tts.highlight.word', true);
  let restoreVoiceError = null;
  try {
    await pointVoiceAndReopen(originalVoiceID);
  } catch (e) {
    restoreVoiceError = String(e);
  }
  const restored = { selectedVoiceID: manager().selectedVoiceID, switches: levels().switches, paused: !!manager().paused };

  return JSON.stringify({ originalVoiceID, selectError, afterSelect, beforePress, ret, toast0, toast1, stateAfterOn, toast49, toast52, restoreVoiceError, restored }, null, 1);
})();
