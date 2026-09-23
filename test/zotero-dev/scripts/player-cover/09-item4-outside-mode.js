// Item 4, bullet 2: outside mode, Top bar and Bottom bar, PDF and EPUB
// (scrolled). Place the current sentence wholly within the covered 34px
// band, then let the next state push arrive: the follow scrolls it
// (last.reason 'cut'), landing the sentence between (the covered edge)
// and the rest of the viewport.
//
// The trigger that fires the correction is the placement scroll itself:
// both follows listen to their container's own scroll event and correct a
// newly-clipped sentence over the following ~500-900ms (a debounce then a
// smooth scroll) -- measured live 2026-09-24, PAUSED throughout, no resume
// needed. A bracketed resume+re-pause tried around the SAME placement
// (case wording: "resume a paused fixture") reliably suppressed the very
// reaction being measured instead of producing it (a second, later
// placement scroll landing back on a value the follow had already issued
// a decision for was then de-duped) -- read as a de-dupe/retarget window
// on a repeated identical target, not as "resuming does nothing"; a bare
// resume was not independently isolated from that interference. Segment
// indices are pre-measured on this fixture/window (single-line, <30px
// tall; PDF 0 near the top / 12 past 871px down; EPUB 4 near the top / 25
// past 871px down).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const state = Zotero.ZoteroTTSRun.state;
  const host = Zotero.getMainWindow();
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';

  const diagFor = async (itemID) => {
    const readers = Zotero.Reader._readers || [];
    const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.autoScroll());
    const idx = readers.findIndex((r) => r.itemID === itemID);
    return idx >= 0 ? diag[idx] : null;
  };
  const setLayout = async (layout) => { Zotero.ZoteroTTS.pluginPlayer.setLayout(layout); await wait(() => Services.prefs.getStringPref(layoutPref, '') === layout ? true : null, 5000); await sleep(150); };
  const activeSegmentOf = (m) => m.activeSegment ?? m._activeSegment ?? null;
  const ensurePaused = async (ir) => {
    if (!ir._readAloudManager?.active) { ir.toggleReadAloudPopup(true); await wait(() => ir._readAloudManager?.active ? true : null, 8000); }
    const m = ir._readAloudManager;
    if (!activeSegmentOf(m)) { if (m.paused) { try { ir.toggleReadAloudPaused(); } catch (e) {} } await wait(() => !!activeSegmentOf(m), 10000); }
    if (!m.paused) { try { m.pause(); } catch (e) {} }
    await wait(() => m.paused ? true : null, 3000);
    return m;
  };
  const waitScrollSettled = async (getScroll, ms) => {
    let last = -1, stable = 0;
    const end = Date.now() + ms;
    while (Date.now() < end) { await sleep(100); const v = getScroll(); if (v === last) { if (++stable >= 3) break; } else { stable = 0; last = v; } }
    return getScroll();
  };

  const oldMode = { value: Services.prefs.getStringPref(modeName, 'sentence'), user: Services.prefs.prefHasUserValue(modeName) };
  Services.prefs.setStringPref(modeName, 'outside');
  await sleep(150);

  const rounds = [];
  const runRound = async ({ kind, itemID, m, layout, band, position, boxOf, getScroll, setScroll, clientHeight }) => {
    await setLayout(layout);
    try { m.pause(); } catch (e) {}
    await sleep(120);
    try { m.repositionTo(position); } catch (e) {}
    await waitScrollSettled(getScroll, 2500); // let repositionTo's own auto-center finish first
    const box = await boxOf();
    if (!box) throw new Error(kind + ' position ' + position + ' produced no box');
    const CH = clientHeight();
    const targetScroll = Math.round(band === 'top' ? Math.max(0, box[1]) : Math.max(0, box[3] - CH));

    // Place the sentence wholly inside the covered band -- itself a real
    // scroll event, and the follow's own trigger (see the file header).
    setScroll(targetScroll);
    await sleep(150); // short: read the as-placed state before the debounce can react
    const before = await diagFor(itemID);
    const scrollNow = getScroll();
    const beforeRelTop = box[1] - scrollNow, beforeRelBottom = box[3] - scrollNow;
    const beforeWhollyInBand = band === 'top' ? (beforeRelTop >= -0.5 && beforeRelBottom <= 34.5) : (beforeRelBottom <= CH + 0.5 && beforeRelTop >= CH - 34.5);
    const lastBeforeAt = before?.last?.at ?? null;

    let sawCut = null;
    for (let i = 0; i < 20 && !sawCut; i++) { await sleep(120); const d = await diagFor(itemID); if (d?.last?.at && d.last.at !== lastBeforeAt && d.last.reason !== 'none') sawCut = d.last; }
    for (let i = 0; i < 15; i++) await sleep(100); // fixed settle for the smooth-scroll correction itself
    const after = await diagFor(itemID);
    const newScroll = getScroll();
    const newRelTop = box[1] - newScroll, newRelBottom = box[3] - newScroll;
    const landedOk = band === 'top' ? (newRelTop >= 34 - 0.5 && newRelBottom <= CH + 0.5) : (newRelBottom <= CH - 34 + 0.5 && newRelTop >= -0.5);
    try { m.pause(); } catch (e) {}
    await wait(() => m.paused, 2000);
    rounds.push({ kind, layout, band, position, box, clientHeight: CH, targetScroll, beforeRelTop, beforeRelBottom, beforeWhollyInBand, sawCut, finalReason: after?.last?.reason ?? null, newScroll, newRelTop, newRelBottom, landedOk });
  };

  // ---- PDF ----
  {
    const itemID = state.fixtures.pdf.itemID;
    const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === itemID);
    host.Zotero_Tabs.select(reader.tabID);
    await sleep(150);
    const ir = reader._internalReader;
    const container = ir._primaryView._iframeWindow.document.getElementById('viewerContainer');
    const m = await ensurePaused(ir);
    const boxOf = async () => (await diagFor(itemID))?.sentence?.whole ?? null;
    const common = { kind: 'pdf', itemID, m, boxOf, getScroll: () => container.scrollTop, setScroll: (v) => container.scrollTo(container.scrollLeft, v), clientHeight: () => container.clientHeight };
    await runRound({ ...common, layout: 'top', band: 'top', position: 0 });
    await runRound({ ...common, layout: 'A', band: 'bottom', position: 12 });
  }

  // ---- EPUB, scrolled flow ----
  {
    const itemID = state.fixtures.epub.itemID;
    const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === itemID);
    host.Zotero_Tabs.select(reader.tabID);
    await sleep(150);
    const ir = reader._internalReader;
    const view = ir._primaryView;
    await view.setFlowMode('scrolled');
    await sleep(500);
    const w = view.iframeWindow;
    const m = await ensurePaused(ir);
    // epub's diag has no box of its own; measure through the view's readAloud state.
    const h = view._readAloud;
    const epubBox = async () => {
      let rects = [];
      try {
        const s = Components.utils.waiveXrays(h?.state);
        const sel = h?._resolveSegmentSelector(s);
        const range = sel ? view.toDisplayedRange(sel) : null;
        const list = range?.getClientRects?.() ?? [];
        for (let i = 0; i < list.length; i++) { const b = list[i]; rects.push([b.left, b.top, b.right, b.bottom]); }
      } catch (e) {}
      if (!rects.length) return null;
      const sx = w.scrollX, sy = w.scrollY;
      return [Math.min(...rects.map((b) => b[0] + sx)), Math.min(...rects.map((b) => b[1] + sy)), Math.max(...rects.map((b) => b[2] + sx)), Math.max(...rects.map((b) => b[3] + sy))];
    };
    const common = { kind: 'epub', itemID, m, boxOf: epubBox, getScroll: () => w.scrollY, setScroll: (v) => w.scrollTo(0, v), clientHeight: () => w.innerHeight };
    await runRound({ ...common, layout: 'top', band: 'top', position: 4 });
    await runRound({ ...common, layout: 'A', band: 'bottom', position: 25 });
    await setLayout('top');
  }

  if (oldMode.user) Services.prefs.setStringPref(modeName, oldMode.value); else Services.prefs.clearUserPref(modeName);
  await sleep(120);

  const checks = rounds.map((r) => ({ kind: r.kind, layout: r.layout, band: r.band, beforeWhollyInBand: r.beforeWhollyInBand, reasonCut: r.sawCut?.reason === 'cut', landedOk: r.landedOk }));

  return JSON.stringify({ rounds, checks, modeRestored: Services.prefs.getStringPref(modeName, '<default>') }, null, 1);
})();
