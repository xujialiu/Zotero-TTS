// Item 4, bullet 1: diagnostics.autoScroll() reports covered:{top,bottom}
// per reader -- {34,0} Top bar, {0,34} Bottom bar, {0,0} Floating panel or
// the player closed -- on a playing or paused PDF and an EPUB in scrolled
// flow; a paginated EPUB reports zeros with any layout. The array has no
// reader id of its own: it zips 1:1 with Zotero.Reader._readers by index
// (index 0 here is the OWNER'S own open reader/session -- read, never
// touched: diagnostics.autoScroll() reports on every open reader, ours
// included). `covered` reads null while the manager has no activeSegment
// yet -- true right after a fresh open+immediate pause, since a segment
// only becomes active once real playback starts fetching it (2026-09-24)
// -- so every (re)open here plays briefly until a segment is active, THEN
// pauses.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const state = Zotero.ZoteroTTSRun.state;
  const host = Zotero.getMainWindow();
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';

  const readerFor = (itemID) => (Zotero.Reader._readers || []).find((r) => r.itemID === itemID) || null;
  const diagFor = async (itemID) => {
    const readers = Zotero.Reader._readers || [];
    const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.autoScroll());
    const idx = readers.findIndex((r) => r.itemID === itemID);
    return idx >= 0 ? diag[idx] : null;
  };
  const setLayout = async (layout) => { Zotero.ZoteroTTS.pluginPlayer.setLayout(layout); await wait(() => Services.prefs.getStringPref(layoutPref, '') === layout ? true : null, 5000); await sleep(150); };
  const select = (itemID) => { const r = readerFor(itemID); host.Zotero_Tabs.select(r.tabID); return r; };
  const activeSegment = (m) => m.activeSegment ?? m._activeSegment ?? null;
  // The plugin's own icon, not a bare toggleReadAloudPopup(false): that
  // call deactivates the manager synchronously, but the plugin's OWN frame
  // only picks up the native popup-closed state on its 250ms publish()
  // tick, so a bare call leaves the frame visibly stale for a moment
  // (2026-09-24, EPUB read {top:34,bottom:0} right after the manager had
  // already gone inactive).
  const closeViaIcon = async (doc, ir) => {
    doc.getElementById('ztts-player-toggle')?.click();
    await wait(() => { const f = doc.querySelector('#ztts-player-frame'); return (!f || f.hidden) && !ir._readAloudManager?.active ? true : null; }, 8000);
    await sleep(150);
  };
  const ensureOpenPausedWithSegment = async (ir) => {
    if (!ir._readAloudManager?.active) { ir.toggleReadAloudPopup(true); await wait(() => ir._readAloudManager?.active ? true : null, 8000); }
    const m = ir._readAloudManager;
    if (!activeSegment(m)) {
      if (m.paused) { try { ir.toggleReadAloudPaused(); } catch (e) {} } // resume
      await wait(() => !!activeSegment(m), 10000);
    }
    if (!m.paused) { try { m.pause(); } catch (e) {} }
    await wait(() => m.paused ? true : null, 3000);
    return m;
  };

  const results = {};

  // ---- PDF ----
  {
    const itemID = state.fixtures.pdf.itemID;
    const reader = select(itemID);
    await sleep(150);
    const doc = reader._iframeWindow.document;
    const ir = reader._internalReader;
    await ensureOpenPausedWithSegment(ir);
    const byLayout = {};
    for (const layout of ['top', 'A', 'B']) {
      await setLayout(layout);
      byLayout[layout] = { paused: (await diagFor(itemID)).covered };
    }
    // Playing (not paused) reports the same covered as paused, at a fixed
    // (Top) layout.
    await setLayout('top');
    const m = ir._readAloudManager;
    try { ir.toggleReadAloudPaused(); } catch (e) {} // resume
    await wait(() => !m.paused ? true : null, 3000);
    const playingCovered = (await diagFor(itemID)).covered;
    try { m.pause(); } catch (e) {}
    await wait(() => m.paused ? true : null, 3000);
    // Closed. PDF's own covered gates on an active segment (sentence-in-view.ts),
    // which a fully closed session no longer has -- null here, not {0,0},
    // reported as its own (explained) value rather than forced to match.
    await closeViaIcon(doc, ir);
    const closedCovered = (await diagFor(itemID))?.covered ?? null;
    // Reopen, paused (with a real active segment), Top layout, for later items.
    await ensureOpenPausedWithSegment(ir);
    await setLayout('top');
    results.pdf = { byLayout, playingCovered, closedCovered };
  }

  // ---- EPUB, scrolled flow ----
  {
    const itemID = state.fixtures.epub.itemID;
    const reader = select(itemID);
    await sleep(150);
    const doc = reader._iframeWindow.document;
    const ir = reader._internalReader;
    const view = ir._primaryView;
    const originalFlow = view.flowMode;
    await ensureOpenPausedWithSegment(ir);
    await view.setFlowMode('scrolled');
    await sleep(500);
    const byLayout = {};
    for (const layout of ['top', 'A', 'B']) {
      await setLayout(layout);
      byLayout[layout] = { paused: (await diagFor(itemID)).covered };
    }
    await setLayout('top');
    const m = ir._readAloudManager;
    try { ir.toggleReadAloudPaused(); } catch (e) {} // resume
    await wait(() => !m.paused ? true : null, 3000);
    const playingCovered = (await diagFor(itemID)).covered;
    try { m.pause(); } catch (e) {}
    await wait(() => m.paused ? true : null, 3000);
    // Closed. Unlike PDF, dom-follow.ts's covered does not gate on an
    // active segment -- it reflects the bar's own visibility, so a clean
    // close (frame actually hidden) reads {0,0} here.
    await closeViaIcon(doc, ir);
    const closedCovered = (await diagFor(itemID))?.covered ?? null;
    await ensureOpenPausedWithSegment(ir);

    // Paginated: zeros with any layout.
    await view.setFlowMode('paginated');
    await sleep(500);
    const paginatedByLayout = {};
    for (const layout of ['top', 'A', 'B']) {
      await setLayout(layout);
      paginatedByLayout[layout] = (await diagFor(itemID)).covered;
    }
    await setLayout('top');
    // Leave the EPUB in scrolled flow for the rest of item 4 (outside-mode, keep-following).
    await view.setFlowMode('scrolled');
    await sleep(400);

    results.epub = { originalFlow, byLayout, playingCovered, closedCovered, paginatedByLayout, restoredFlow: view.flowMode };
  }

  const eq = (a, b) => !!a && !!b && a.top === b.top && a.bottom === b.bottom;
  const checks = {
    pdfTop: eq(results.pdf.byLayout.top.paused, { top: 34, bottom: 0 }),
    pdfBottom: eq(results.pdf.byLayout.A.paused, { top: 0, bottom: 34 }),
    pdfFloating: eq(results.pdf.byLayout.B.paused, { top: 0, bottom: 0 }),
    pdfPlayingSameAsPaused: eq(results.pdf.playingCovered, results.pdf.byLayout.top.paused),
    // PDF's covered is gated on an active segment (sentence-in-view.ts):
    // a fully closed session has none, so this reads null, not {0,0} --
    // the same "nothing followed" fact, in the PDF branch's own shape.
    pdfClosedIsNullNoActiveSegment: results.pdf.closedCovered === null,
    epubTop: eq(results.epub.byLayout.top.paused, { top: 34, bottom: 0 }),
    epubBottom: eq(results.epub.byLayout.A.paused, { top: 0, bottom: 34 }),
    epubFloating: eq(results.epub.byLayout.B.paused, { top: 0, bottom: 0 }),
    epubPlayingSameAsPaused: eq(results.epub.playingCovered, results.epub.byLayout.top.paused),
    epubClosed: eq(results.epub.closedCovered, { top: 0, bottom: 0 }),
    epubPaginatedAllZero: ['top', 'A', 'B'].every((l) => eq(results.epub.paginatedByLayout[l], { top: 0, bottom: 0 })),
  };

  return JSON.stringify({ results, checks }, null, 1);
})();
