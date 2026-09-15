// Item 5 (the Sentence switch) plus highlight.md's 5.5 (the Sentence
// switch's sentence-under-word timing) and 3.5 (style carries all six
// prefs). Fixture A is resumed for the live "next state push" claim (a
// paused session keeps its old sentence slot until it resumes); the EPUB
// is read paused, then nudged with manager.repositionTo(same index) to
// see whether that alone counts as a state push.
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  const d = win.document;
  const sentenceCb = d.getElementById('ztts-highlight-sentence');
  const wordCb = d.getElementById('ztts-highlight-word');
  const setChecked = (cb, value) => {
    cb.checked = value;
    cb.dispatchEvent(new win.Event('command', { bubbles: true }));
  };

  const readers = Zotero.Reader._readers || [];
  const fixtures = Zotero.ZoteroTTSRun.state.fixtures;
  const idxA = readers.findIndex((r) => r.itemID === fixtures.a.itemID);
  const idxEpub = readers.findIndex((r) => r.itemID === fixtures.epub.itemID);
  const readerA = readers[idxA];
  const mA = readerA._internalReader._readAloudManager;
  const viewA = readerA._internalReader._primaryView;

  const highlightAll = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.highlight());
  const pdfSnap = () => {
    const h = highlightAll()[idxA];
    return {
      style: h.style,
      view: { sentenceSlot: h.views[0].sentenceSlot, granularity: h.views[0].granularity, secondaryTrim: h.views[0].secondaryTrim },
      slotIsNull: viewA._readAloudSentenceHighlightedPosition === null || viewA._readAloudSentenceHighlightedPosition === undefined,
      rectCount: (viewA._readAloudHighlightedPosition?.rects ?? []).length,
      wordDisabled: wordCb.hasAttribute('disabled'),
      sentenceColorDisabled: d.getElementById('ztts-highlight-sentenceColor').hasAttribute('disabled'),
      sentenceAlphaDisabled: d.getElementById('ztts-highlight-sentenceAlpha').hasAttribute('disabled'),
      previewBefore: d.getElementById('ztts-highlight-preview-word-before').getAttribute('style'),
      previewAfter: d.getElementById('ztts-highlight-preview-word-after').getAttribute('style'),
    };
  };

  // Resume A: needs an actual state push for the secondary slot to react
  if (mA.active && mA.paused) mA.togglePaused();
  await sleep(300);
  const before = pdfSnap();

  setChecked(sentenceCb, false);
  const rightAfterFlip = pdfSnap(); // same script as the flip -- style already false, slot may not have moved yet
  await sleep(350); // at least one word onset while playing
  const afterPush = pdfSnap();

  setChecked(sentenceCb, true);
  await sleep(350);
  const restoredPush = pdfSnap();

  // Re-pause A
  if (mA.active && !mA.paused) mA.togglePaused();
  await sleep(150);

  // --- EPUB: paused. Read its current sentence slot, flip Sentence off with
  // no further push, confirm it is unchanged, then try repositionTo(same
  // index) as a forced push.
  const readerEpub = readers[idxEpub];
  const mEpub = readerEpub._internalReader._readAloudManager;
  const viewEpub = readerEpub._internalReader._primaryView;
  const epubSnap = () => {
    const h = highlightAll()[idxEpub];
    return { style: h.style, sentenceSlot: h.views[0].sentenceSlot, sentencePieces: h.views[0].sentencePieces };
  };
  const epubBeforeFlip = epubSnap();
  setChecked(sentenceCb, false);
  const epubRightAfterFlip = epubSnap(); // style.sentence false already; slot expected UNCHANGED (paused keeps its sentence)
  let repositionError = null;
  const posBefore = mEpub._controller?._position ?? 0;
  try {
    mEpub.repositionTo(posBefore);
  } catch (e) {
    repositionError = String(e);
  }
  await sleep(300);
  const epubAfterReposition = epubSnap();

  setChecked(sentenceCb, true);
  await sleep(200);
  try {
    mEpub.repositionTo(mEpub._controller?._position ?? posBefore);
  } catch (e) {
    repositionError = repositionError || String(e);
  }
  await sleep(300);
  const epubRestored = epubSnap();

  return JSON.stringify(
    { before, rightAfterFlip, afterPush, restoredPush, epubBeforeFlip, epubRightAfterFlip, repositionError, epubAfterReposition, epubRestored },
    null,
    1,
  );
})();
