// Final cleanup: close and erase the two fresh fixtures, close the EPUB's
// popup and tab (never erased -- a standing library item), restore every
// touched pref in order with readAloud.memory last, close the settings
// window, and report the error console.
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fullName = (rel) => 'extensions.zotero.' + rel;
  const restoreBool = (rel, snap) => {
    if (snap.hasUserValue) Zotero.Prefs.set(rel, snap.value);
    else Zotero.Prefs.clear(rel);
  };

  const baseline = Zotero.ZoteroTTSRun.state.baseline;
  const voicePrep = Zotero.ZoteroTTSRun.state.voicePrep;
  const fixtures = Zotero.ZoteroTTSRun.state.fixtures;
  const win = Zotero.getMainWindow ? Zotero.getMainWindow() : Services.wm.getMostRecentWindow('navigator:browser');

  // --- Close the settings window ---
  const prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  if (prefWin) {
    prefWin.close();
    const until = Date.now() + 5000;
    while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() < until) await sleep(100);
  }

  // --- Close fixture readers' popups, close A and B's tabs, close EPUB's tab (never erased) ---
  const closeReader = async (itemID, erase) => {
    const r = (Zotero.Reader._readers || []).find((x) => x.itemID === itemID);
    if (!r) return { found: false };
    try {
      r._internalReader.toggleReadAloudPopup(false);
    } catch (e) {
      /* already closed */
    }
    await sleep(250);
    try {
      await r.close();
    } catch (e) {
      /* best effort */
    }
    await sleep(200);
    if (erase) {
      try {
        const item = Zotero.Items.get(itemID);
        await item.eraseTx();
      } catch (e) {
        return { found: true, eraseError: String(e) };
      }
    }
    return { found: true };
  };
  const closedA = await closeReader(fixtures.a.itemID, true);
  const closedB = await closeReader(fixtures.b.itemID, true);
  const closedEpub = await closeReader(fixtures.epub.itemID, false);

  // --- Restore the highlight-section prefs to no user value ---
  Zotero.Prefs.clear('zotero-tts.highlight.sentence');
  Zotero.Prefs.clear('zotero-tts.highlight.word');
  Zotero.Prefs.clear('zotero-tts.highlight.wordColor');
  Zotero.Prefs.clear('zotero-tts.highlight.wordAlpha');
  Zotero.Prefs.clear('zotero-tts.highlight.sentenceColor');
  Zotero.Prefs.clear('zotero-tts.highlight.sentenceAlpha');
  // sentenceUnderWord: the plugin's own startup already clears this every
  // time it starts (startHighlightLevels); nothing of this run's to undo

  // --- Shortcut, volume, provider/isolation prefs back to baseline ---
  restoreBool('zotero-tts.shortcuts.toggleWordHighlight', baseline.shortcutToggleWordHighlight);
  restoreBool('zotero-tts.readAloud.volume', baseline.readAloudVolume);
  restoreBool('zotero-tts.azure.enabled', voicePrep.before.azureEnabled);
  restoreBool('zotero-tts.readAloud.sameForAllDocuments', voicePrep.before.sameForAllDocuments);

  // --- reader.readAloudVoices back byte-for-byte ---
  Services.prefs.setStringPref(fullName('reader.readAloudVoices'), voicePrep.before.readerReadAloudVoicesRaw);

  // --- readAloud.memory LAST, byte-for-byte ---
  Services.prefs.setStringPref(fullName('zotero-tts.readAloud.memory'), baseline.readAloudMemory.value);

  await sleep(200);

  // --- Debug store back to its original setting ---
  Zotero.Debug.setStore(!!baseline.debugStoring);

  // --- Byte-for-byte verification ---
  const snap = (rel) => ({ value: Zotero.Prefs.get(rel), hasUserValue: Services.prefs.prefHasUserValue(fullName(rel)) });
  const verify = {
    highlightSentence: snap('zotero-tts.highlight.sentence'),
    highlightWord: snap('zotero-tts.highlight.word'),
    wordColor: snap('zotero-tts.highlight.wordColor'),
    wordAlpha: snap('zotero-tts.highlight.wordAlpha'),
    sentenceColor: snap('zotero-tts.highlight.sentenceColor'),
    sentenceAlpha: snap('zotero-tts.highlight.sentenceAlpha'),
    sentenceUnderWord: snap('zotero-tts.highlight.sentenceUnderWord'),
    shortcutToggleWordHighlight: snap('zotero-tts.shortcuts.toggleWordHighlight'),
    readAloudVolume: snap('zotero-tts.readAloud.volume'),
    azureEnabled: snap('zotero-tts.azure.enabled'),
    sameForAllDocuments: snap('zotero-tts.readAloud.sameForAllDocuments'),
    readerReadAloudVoicesMatches: Services.prefs.getStringPref(fullName('reader.readAloudVoices'), '') === voicePrep.before.readerReadAloudVoicesRaw,
    readAloudMemoryMatches: Services.prefs.getStringPref(fullName('zotero-tts.readAloud.memory'), '') === baseline.readAloudMemory.value,
    zoteroHighlightGranularityNow: Zotero.Prefs.get('reader.readAloud.highlightGranularity'),
    debugStoringNow: Zotero.Debug.storing,
  };

  const remainingReaders = (Zotero.Reader._readers || []).map((r) => r.itemID);
  const ownerItemID = Zotero.ZoteroTTSRun.params.ownerItemID ?? null;
  const ownerReader = ownerItemID === null ? null : (Zotero.Reader._readers || []).find((r) => r.itemID === ownerItemID);
  const ownerManager = ownerReader?._internalReader?._readAloudManager;
  const ownerStillUntouched = ownerItemID === null ? null : { active: !!ownerManager?.active, paused: !!ownerManager?.paused, selectedVoiceID: ownerManager?.selectedVoiceID ?? null };

  return JSON.stringify(
    { closedA, closedB, closedEpub, baselineUsed: { volume: baseline.readAloudVolume, shortcut: baseline.shortcutToggleWordHighlight, debugStoring: baseline.debugStoring }, verify, remainingReaders, ownerStillUntouched },
    null,
    1,
  );
})();
