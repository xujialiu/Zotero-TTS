// Item 4: the Word switch drives the screen. Fixture A is resumed (its
// controller was created under a trusted gesture in 03-audio-probe.js, so
// a plain togglePaused() may run it -- only *creating* a context needs the
// trusted gesture) to check the live claims (position unchanged, word
// index advancing, no restart); the EPUB is left paused and its spotlight
// color is read straight from the patched _getSpotlightColor, which is a
// pure function of the current switches -- no repaint needed to see it
// change.
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  const d = win.document;
  const wordCb = d.getElementById('ztts-highlight-word');
  const sentenceCb = d.getElementById('ztts-highlight-sentence');
  const setChecked = (cb, value) => {
    cb.checked = value;
    cb.dispatchEvent(new win.Event('command', { bubbles: true }));
  };

  const fixtures = Zotero.ZoteroTTSRun.state.fixtures;
  const readerA = (Zotero.Reader._readers || []).find((r) => r.itemID === fixtures.a.itemID);
  const mA = readerA._internalReader._readAloudManager;
  const viewA = readerA._internalReader._primaryView;

  const readerEpub = (Zotero.Reader._readers || []).find((r) => r.itemID === fixtures.epub.itemID);
  const viewEpub = readerEpub._internalReader._primaryView;
  const spotlightColor = (view, key) => {
    try {
      return Reflect.apply(view._getSpotlightColor, view, [key]);
    } catch (e) {
      return 'ERROR:' + String(e);
    }
  };

  const snapA = () => ({
    switches: JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels()).switches,
    zoteroPref: Zotero.Prefs.get('reader.readAloud.highlightGranularity'),
    readersState: JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels()).readers,
    posKind: viewA._readAloudHighlightedPosition ? (Array.isArray(viewA._readAloudHighlightedPosition.rects) ? viewA._readAloudHighlightedPosition.rects.length : null) : null,
    rectWidths: (viewA._readAloudHighlightedPosition?.rects ?? []).map((r) => Math.round((r[2] - r[0]) * 10) / 10),
    position: mA?._controller?._position ?? null,
    controllerRef: mA?._controller ?? null,
    paused: !!mA?.paused,
    active: !!mA?.active,
    sentenceDisabled: sentenceCb.hasAttribute('disabled'),
    wordDisabled: wordCb.hasAttribute('disabled'),
    wordColorDisabled: d.getElementById('ztts-highlight-wordColor').hasAttribute('disabled'),
    wordAlphaDisabled: d.getElementById('ztts-highlight-wordAlpha').hasAttribute('disabled'),
    sentenceColorDisabled: d.getElementById('ztts-highlight-sentenceColor').hasAttribute('disabled'),
    previewWordStyle: d.getElementById('ztts-highlight-preview-word').getAttribute('style'),
    previewBeforeStyle: d.getElementById('ztts-highlight-preview-word-before').getAttribute('style'),
  });

  // --- Resume A for the live checks ---
  if (mA.active && mA.paused) mA.togglePaused();
  await sleep(300);
  const beforePlaying = snapA();

  // --- Flip Word off, same script ---
  setChecked(wordCb, false);
  const afterWordOff = snapA();
  const sameController = beforePlaying.controllerRef === afterWordOff.controllerRef;
  delete beforePlaying.controllerRef;
  delete afterWordOff.controllerRef;

  await sleep(250);
  const shortlyAfter = snapA();
  delete shortlyAfter.controllerRef;

  // --- Flip Word back on ---
  setChecked(wordCb, true);
  await sleep(50);
  const afterWordOn = snapA();
  delete afterWordOn.controllerRef;

  // Re-pause A -- our own fixture
  if (mA.active && !mA.paused) mA.togglePaused();
  await sleep(150);

  // --- EPUB: paused, read the spotlight color as a pure function of the switches ---
  const epubBefore = { segment: spotlightColor(viewEpub, 'ReadAloudActiveSegment'), switches: JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels()).switches };
  setChecked(wordCb, false);
  const epubWordOff = { segment: spotlightColor(viewEpub, 'ReadAloudActiveSegment'), switches: JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels()).switches };
  setChecked(wordCb, true);
  const epubWordOn = { segment: spotlightColor(viewEpub, 'ReadAloudActiveSegment') };

  return JSON.stringify(
    { beforePlaying, afterWordOff, sameController, shortlyAfter, afterWordOn, epubBefore, epubWordOff, epubWordOn },
    null,
    1,
  );
})();
