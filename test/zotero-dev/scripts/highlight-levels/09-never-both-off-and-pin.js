// Item 6 (never both off) and item 7 (Zotero's pref is pinned against a
// foreign write). Uses the pane already open on Highlight and fixture A
// (paused, untouched by this script).
return (async () => {
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  const d = win.document;
  const sentenceCb = d.getElementById('ztts-highlight-sentence');
  const wordCb = d.getElementById('ztts-highlight-word');
  const setChecked = (cb, value) => {
    cb.checked = value;
    cb.dispatchEvent(new win.Event('command', { bubbles: true }));
  };
  const levels = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels());
  const rawPrefs = () => ({ sentence: Zotero.Prefs.get('zotero-tts.highlight.sentence'), word: Zotero.Prefs.get('zotero-tts.highlight.word') });

  // --- Item 6a: uncheck Sentence via the UI, Word becomes the disabled last-one-on ---
  setChecked(sentenceCb, false);
  const afterSentenceOff = { switches: levels().switches, wordDisabled: wordCb.hasAttribute('disabled'), sentenceDisabled: sentenceCb.hasAttribute('disabled') };

  // --- Item 6b: pane OPEN, write word=false directly while sentence is already false ---
  Zotero.Prefs.set('zotero-tts.highlight.word', false);
  const paneOpenBothOffWrite = { switches: levels().switches, rawPrefs: rawPrefs(), sentenceChecked: sentenceCb.checked, sentenceDisabled: sentenceCb.hasAttribute('disabled'), zoteroPref: Zotero.Prefs.get('reader.readAloud.highlightGranularity') };

  // Restore both true, close the pane for item 6c
  Zotero.Prefs.set('zotero-tts.highlight.sentence', true);
  Zotero.Prefs.set('zotero-tts.highlight.word', true);
  win.close();
  await new Promise((r) => setTimeout(r, 400));

  // --- Item 6c: same raw write, pane CLOSED ---
  Zotero.Prefs.set('zotero-tts.highlight.sentence', false);
  Zotero.Prefs.set('zotero-tts.highlight.word', false);
  const paneClosedBothOffWrite = { switches: levels().switches, rawPrefs: rawPrefs(), zoteroPref: Zotero.Prefs.get('reader.readAloud.highlightGranularity') };

  // Restore both true before item 7
  Zotero.Prefs.set('zotero-tts.highlight.sentence', true);
  Zotero.Prefs.set('zotero-tts.highlight.word', true);
  const restored6 = { switches: levels().switches };

  // --- Item 7: Zotero's pref is pinned ---
  const snapBefore = levels().pin.snapped;
  Zotero.Prefs.set('reader.readAloud.highlightGranularity', 'paragraph');
  const readBackImmediately = Zotero.Prefs.get('reader.readAloud.highlightGranularity');
  const afterParagraphWrite = { readBackImmediately, pin: levels().pin, readersAllWord: levels().readers.every((r) => r.state === 'word') };

  Zotero.Prefs.set('reader.readAloud.highlightGranularity', 'sentence');
  const afterSentenceWrite = { readBack: Zotero.Prefs.get('reader.readAloud.highlightGranularity'), pin: levels().pin };

  // A write of the CURRENT pinned value itself: changes nothing, counts nothing
  // (found live: writing a hard-coded 'sentence' here is wrong once the pin
  // has already snapped back to 'word' by the previous step -- that is a
  // foreign write, not a no-op, and it does increment; read the pin's own
  // "wanted" first and write exactly that)
  const pinBeforeNoop = levels().pin;
  Zotero.Prefs.set('reader.readAloud.highlightGranularity', pinBeforeNoop.wanted);
  const noopWrite = { wrote: pinBeforeNoop.wanted, readBack: Zotero.Prefs.get('reader.readAloud.highlightGranularity'), snapped: levels().pin.snapped, unchanged: levels().pin.snapped === pinBeforeNoop.snapped };

  // Word off (via a real pane, reopened) -> pinned "sentence"; a foreign 'word' write should snap back to 'sentence'
  Zotero.Prefs.set('zotero-tts.highlight.word', false);
  const snapBeforeForeignWord = levels().pin.snapped;
  Zotero.Prefs.set('reader.readAloud.highlightGranularity', 'word');
  const foreignWordWhilePinnedSentence = { readBack: Zotero.Prefs.get('reader.readAloud.highlightGranularity'), snapped: levels().pin.snapped, incremented: levels().pin.snapped === snapBeforeForeignWord + 1 };
  // Restore both switches to true before item 8
  Zotero.Prefs.set('zotero-tts.highlight.word', true);
  const restored7 = { switches: levels().switches, zoteroPref: Zotero.Prefs.get('reader.readAloud.highlightGranularity') };

  return JSON.stringify(
    { afterSentenceOff, paneOpenBothOffWrite, paneClosedBothOffWrite, restored6, snapBefore, afterParagraphWrite, afterSentenceWrite, noopWrite, foreignWordWhilePinnedSentence, restored7 },
    null,
    1,
  );
})();
