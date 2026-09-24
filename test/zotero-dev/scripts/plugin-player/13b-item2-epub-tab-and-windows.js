// Item 2, remainder of the matrix: EPUB fixture in a tab (toolbar button),
// then the SAME PDF and EPUB fixtures moved into their own reader windows
// (Zotero.Reader.open(..., { openInWindow: true }), the code path "Move to
// New Window" ends in -- ReaderWindow extends ReaderInstance, xpcom/reader.js
// 264/2204) -- one entry point each, sampling .read-aloud-popup/#read-aloud
// computed display every 50ms past the Player's 250ms tick.
// params: none. state: reads fixtures.pdf/epub, writes fixtures.pdfWindowTabID/epubWindowTabID.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'item2-epub-tab-and-windows', entries: [] };
  const fixtures = state.fixtures;
  if (!fixtures?.pdf?.id || !fixtures?.epub?.id) throw new Error('state.fixtures.pdf/epub missing -- run 12 first');

  const win = Zotero.getMainWindow();
  win.minimize();
  await sleep(150);

  const waitReader = async (pred) => {
    for (let i = 0; i < 120; i++) {
      for (const r of (Zotero.Reader?._readers ?? [])) if (pred(r) && r._internalReader?._readAloudManager) return r;
      await sleep(100);
    }
    return null;
  };
  const nativeDisplay = (doc) => { const el = doc.querySelector('.read-aloud-popup'); return el ? doc.defaultView.getComputedStyle(el).display : 'ABSENT'; };
  const nativeButtonDisplay = (doc) => { const el = doc.querySelector('#read-aloud'); return el ? doc.defaultView.getComputedStyle(el).display : 'ABSENT'; };
  const playerOpen = (doc) => { const f = doc.getElementById('ztts-player-frame'); return !!f && !f.hidden; };
  const closeReading = async (reader) => {
    try { reader._internalReader.toggleReadAloudPopup(false); } catch (e) {}
    for (let i = 0; i < 60; i++) { if (!reader._internalReader?._readAloudManager?.active) break; await sleep(100); }
  };
  const testEntry = async (label, reader) => {
    const doc = reader._iframeWindow.document;
    const trace = [{ t: 0, phase: 'before', popup: nativeDisplay(doc), button: nativeButtonDisplay(doc), playerOpen: playerOpen(doc) }];
    reader._internalReader.startReadAloudAtPosition();
    let openedAt = null;
    for (let i = 0; i < 20; i++) {
      await sleep(50);
      const s = { t: (i + 1) * 50, popup: nativeDisplay(doc), button: nativeButtonDisplay(doc), playerOpen: playerOpen(doc), active: !!reader._internalReader?._readAloudManager?.active };
      trace.push(s);
      if (s.playerOpen && openedAt === null) openedAt = s.t;
      if (openedAt !== null && i >= (openedAt / 50) + 2) break;
    }
    const allNonePopup = trace.every((s) => s.popup === 'none' || s.popup === 'ABSENT');
    const allNoneButton = trace.every((s) => s.button === 'none' || s.button === 'ABSENT');
    const result = { label, openedAt, samples: trace.length, first: trace[0], last: trace[trace.length - 1], allNonePopup, allNoneButton, zoteroNeverShown: allNonePopup && allNoneButton };
    await closeReading(reader);
    return result;
  };

  // EPUB in a tab
  const epubOpened = Zotero.Reader.open(fixtures.epub.id);
  if (epubOpened && typeof epubOpened.then === 'function') await epubOpened;
  const epubReaderAny = await waitReader((r) => r.itemID === fixtures.epub.id);
  if (!epubReaderAny) throw new Error('EPUB fixture reader never exposed _internalReader/_readAloudManager');
  out.entries.push(await testEntry('epub-tab-toolbar-equivalent', epubReaderAny));

  // PDF in its own reader window: snapshot the existing reader instances for this item first,
  // so the NEW one (the window's own) is found by exclusion, not by guessing a field.
  const before = new Set((Zotero.Reader._readers || []).filter((r) => r.itemID === fixtures.pdf.id));
  const pdfWinOpened = Zotero.Reader.open(fixtures.pdf.id, null, { openInWindow: true });
  if (pdfWinOpened && typeof pdfWinOpened.then === 'function') await pdfWinOpened;
  let pdfWinReaderAny = null;
  for (let i = 0; i < 120 && !pdfWinReaderAny; i++) {
    for (const r of (Zotero.Reader._readers || [])) {
      if (r.itemID === fixtures.pdf.id && !before.has(r) && r._internalReader?._readAloudManager) { pdfWinReaderAny = r; break; }
    }
    if (!pdfWinReaderAny) await sleep(100);
  }
  out.pdfWindowReaderConstructor = pdfWinReaderAny?.constructor?.name ?? null;
  out.pdfWindowIsSeparateWindow = !!(pdfWinReaderAny && pdfWinReaderAny._window && pdfWinReaderAny._window !== win);
  if (pdfWinReaderAny) {
    out.entries.push(await testEntry('pdf-reader-window-native-path', pdfWinReaderAny));
    try { pdfWinReaderAny._window?.close(); } catch (e) {}
  } else {
    out.pdfWindowSkipped = 'no distinct new reader instance appeared for openInWindow';
  }

  win.minimize();
  return JSON.stringify(out, null, 1);
})()
