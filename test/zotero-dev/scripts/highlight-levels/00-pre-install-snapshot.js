// Runs on the PREVIOUS build (1.12.11-beta2, no highlight-pin), before
// zotero_plugin_install. Item 3 needs Zotero's own highlight level and the
// old sentenceUnderWord switch pre-set to values the new build's startup
// must undo, so this snapshot + those two writes happen in one script,
// last, before the install.
return (async () => {
  const Zp = Zotero.Prefs;
  const full = (rel) => 'extensions.zotero.' + rel;
  const snap = (rel) => {
    let value;
    try {
      value = Zp.get(rel);
    } catch (e) {
      value = 'ERROR:' + String(e);
    }
    let hasUserValue;
    try {
      hasUserValue = Services.prefs.prefHasUserValue(full(rel));
    } catch (e) {
      hasUserValue = 'ERROR:' + String(e);
    }
    return { value, hasUserValue };
  };

  const before = {
    zoteroHighlightGranularity: snap('reader.readAloud.highlightGranularity'),
    sentenceUnderWord: snap('zotero-tts.highlight.sentenceUnderWord'),
    highlightSentence: snap('zotero-tts.highlight.sentence'),
    highlightWord: snap('zotero-tts.highlight.word'),
    wordColor: snap('zotero-tts.highlight.wordColor'),
    wordAlpha: snap('zotero-tts.highlight.wordAlpha'),
    sentenceColor: snap('zotero-tts.highlight.sentenceColor'),
    sentenceAlpha: snap('zotero-tts.highlight.sentenceAlpha'),
    shortcutToggleWordHighlight: snap('zotero-tts.shortcuts.toggleWordHighlight'),
    readAloudVolume: snap('zotero-tts.readAloud.volume'),
    readAloudMemory: snap('zotero-tts.readAloud.memory'),
    readerReadAloudVoices: snap('reader.readAloudVoices'),
    debugStoring: Zotero.Debug.storing,
  };

  const writeErrors = [];
  // Item 3 prep, on this (previous) build
  try {
    Zp.set('reader.readAloud.highlightGranularity', 'paragraph');
  } catch (e) {
    writeErrors.push('granularity: ' + String(e));
  }
  try {
    Zp.set('zotero-tts.highlight.sentenceUnderWord', false);
  } catch (e) {
    writeErrors.push('sentenceUnderWord: ' + String(e));
  }
  const afterItem3Write = {
    zoteroHighlightGranularity: snap('reader.readAloud.highlightGranularity'),
    sentenceUnderWord: snap('zotero-tts.highlight.sentenceUnderWord'),
  };

  // Mute for the whole run (rulebook "How to drive")
  try {
    Zp.set('zotero-tts.readAloud.volume', 0);
  } catch (e) {
    writeErrors.push('volume: ' + String(e));
  }

  let errorsBefore;
  try {
    errorsBefore = Zotero.getErrors(true);
  } catch (e) {
    errorsBefore = ['ERROR:' + String(e)];
  }
  try {
    Zotero.Debug.setStore(true);
  } catch (e) {
    writeErrors.push('debugStore: ' + String(e));
  }

  Zotero.ZoteroTTSRun.state.baseline = before;
  Zotero.ZoteroTTSRun.state.item3 = { before, afterItem3Write };

  return JSON.stringify(
    {
      installedVersionExpected: '1.12.11-beta2',
      before,
      afterItem3Write,
      writeErrors,
      errorsBeforeCount: errorsBefore.length,
      errorsBeforeTail: errorsBefore.slice(-3),
    },
    null,
    1,
  );
})();
