// Item 1: the start point (unchanged, Zotero's own selection/target/saved
// position/first-visible-block priority -- ADR 0005 leaves Segmentation,
// Highlight, Follow and Position to Zotero). Checks, for an explicit target,
// a text selection with the trusted Shift+Space key (#105), and the saved
// position on a bare reopen: session.position (and currentIndex) equal the
// index of manager.activeSegment once it plays -- polled, since activation
// (manager.active) precedes the clip actually starting by as much as the
// provider's fetch time. The "active segment if still listed" condition is
// evidenced in the handoff item (a rebuild there keeps the same segment);
// "first visible block" is evidenced in 133-02, where nothing else applied.
// REVISED (2026-09-23): the first attempt read `manager.activeSegment` only
// ~500 ms after `active` went true and re-used one `segments` snapshot across
// several activate/deactivate cycles; `_readAloudSegments` is a fresh object
// after each reactivation, so segment 3's span could not be found the second
// time around. Now segs is re-read fresh before each phase and the wait polls
// for the clip to actually start.
// params: none. state: reads fixtures.A (from 133-02, reader must already be
// open); writes item1.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'item1-start-points' };
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found -- run 133-02 first');
  const ir = r._internalReader;
  const view = ir._primaryView;
  const rw = view._iframeWindow;
  let m = ir._readAloudManager;
  const vw = Components.utils.waiveXrays(view);

  const currentSegs = () => (ir._readAloudSegments && ir._readAloudSegments.segments) || null;
  const activeIndexOf = (segs) => {
    const seg = m.activeSegment;
    if (!seg || !segs) return -1;
    for (let i = 0; i < segs.length; i++) if (segs[i] === seg) return i;
    return -1;
  };
  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };
  const deactivate = async () => {
    m = ir._readAloudManager;
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    try { ir.toggleReadAloudPopup(false); } catch (e) {}
    for (let i = 0; i < 100; i++) { m = ir._readAloudManager; if (!m.active) break; await sleep(50); }
  };
  // Poll until the clip has actually started (manager.activeSegment set, not
  // merely `active`) and the Engine's session position/currentIndex agree
  // with it; up to 15 s for a segment this run has never fetched before.
  const waitPlaying = async (ceilingMs = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs) {
      m = ir._readAloudManager;
      const segs = currentSegs();
      const idx = activeIndexOf(segs);
      if (m.active && idx >= 0) {
        const eng = await engineFor();
        if (eng && eng.session.currentIndex === idx) return { ok: true, index: idx, eng, ms: Date.now() - t0 };
      }
      await sleep(100);
    }
    return { ok: false, index: activeIndexOf(currentSegs()), eng: await engineFor(), ms: Date.now() - t0 };
  };
  const spanFor = (segment) => {
    const spans = ir._readAloudSegments.getSegmentTextSpans(segment) || [];
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      if (span && span.node && Number.isInteger(span.start) && Number.isInteger(span.end) && span.end > span.start) return span;
    }
    return null;
  };
  const sourcePositionFor = (segment) => {
    const span = spanFor(segment);
    if (!span) return null;
    const raw = [{ ref: JSON.parse(JSON.stringify(span.ref)), node: JSON.parse(JSON.stringify(span.node)), start: span.start, end: span.end }];
    return ir._sdt.mapper.textNodeSpansToSourcePosition(Components.utils.cloneInto(raw, rw));
  };

  await ir._loadSDT();
  await deactivate();
  out.deactivated = { active: m.active, paused: m.paused };

  // Explicit target: a mid-document segment (index 8)
  let segs = currentSegs();
  out.segCount = segs ? segs.length : 0;
  const targetIndex = Math.min(8, (segs ? segs.length : 1) - 1);
  const targetPos = sourcePositionFor(segs[targetIndex]);
  out.explicitTarget = { requestedIndex: targetIndex, gotSourcePosition: !!targetPos };
  if (targetPos) {
    ir.startReadAloudAtPosition(targetPos);
    const w = await waitPlaying();
    out.explicitTarget.becamePlaying = w.ok;
    out.explicitTarget.waitMs = w.ms;
    out.explicitTarget.managerActiveIndex = w.index;
    out.explicitTarget.sessionPosition = w.eng ? w.eng.session.position : null;
    out.explicitTarget.sessionCurrentIndex = w.eng ? w.eng.session.currentIndex : null;
    out.explicitTarget.mechanismMatch = w.ok && w.eng && w.eng.session.position === w.index && w.eng.session.currentIndex === w.index;
    out.explicitTarget.landedOnRequested = w.index === targetIndex;
  }
  await deactivate();

  // A text selection, then the trusted Shift+Space key (issue #105): index 3
  segs = currentSegs();
  const selIndex = Math.min(3, (segs ? segs.length : 1) - 1);
  const selSpan = spanFor(segs[selIndex]);
  out.selection = { requestedIndex: selIndex, gotSpan: !!selSpan };
  if (selSpan) {
    const text = (String(selSpan.node.text || '').slice(selSpan.start, selSpan.end).trim().split(/\s+/)[0] || 'x');
    const raw = [{ ref: JSON.parse(JSON.stringify(selSpan.ref)), node: JSON.parse(JSON.stringify(selSpan.node)), start: selSpan.start, end: selSpan.start + text.length }];
    const position = ir._sdt.mapper.textNodeSpansToSourcePosition(Components.utils.cloneInto(raw, rw));
    const range = {
      pageIndex: position.pageIndex, anchorOffset: 0, headOffset: text.length, collapsed: false,
      anchor: true, head: true, sortIndex: '00000|00000|00000', position: JSON.parse(JSON.stringify(position)), text,
    };
    vw._setSelectionRanges(Components.utils.cloneInto([range], rw));
    out.selection.hasTarget = !!vw.hasReadAloudTarget;

    Zotero_Tabs.select(r.tabID);
    try { r._window.focus(); } catch (e) {}
    try { rw.focus(); } catch (e) {}
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const host = r._window;
    const K = host.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(host);
    const keys = [tip.keydown(ev('Shift', 'ShiftLeft', 16, true)), tip.keydown(ev(' ', 'Space', 32, true)), tip.keyup(ev(' ', 'Space', 32, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16, false))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    out.selection.keydownConsumed = keys[1];

    const w = await waitPlaying();
    out.selection.becamePlaying = w.ok;
    out.selection.waitMs = w.ms;
    out.selection.managerActiveIndex = w.index;
    out.selection.sessionPosition = w.eng ? w.eng.session.position : null;
    out.selection.sessionCurrentIndex = w.eng ? w.eng.session.currentIndex : null;
    out.selection.mechanismMatch = w.ok && w.eng && w.eng.session.position === w.index && w.eng.session.currentIndex === w.index;
    out.selection.landedOnRequested = w.index === selIndex;
    try { vw._setSelectionRanges(); } catch (e) {}
  }
  m = ir._readAloudManager;
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  await sleep(200);
  const savedPositionSourceIndex = activeIndexOf(currentSegs());
  await deactivate();

  // The saved position near the view: reopen with no selection and no target
  try { ir.toggleReadAloudPopup(true); } catch (e) {}
  const w2 = await waitPlaying();
  out.savedPositionResume = {
    savedPositionSourceIndex,
    becamePlaying: w2.ok,
    waitMs: w2.ms,
    managerActiveIndex: w2.index,
    sessionPosition: w2.eng ? w2.eng.session.position : null,
    mechanismMatch: w2.ok && w2.eng && w2.eng.session.position === w2.index,
    landedOnSaved: w2.index === savedPositionSourceIndex,
  };
  m = ir._readAloudManager;
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  out.firstVisibleBlockEvidence = 'from item2 (133-02): on the very first open of this fixture -- no active segment, selection, target or saved position existed yet -- manager.activeSegment landed on index 0 and session.position was 0';

  S.item1 = out;
  return JSON.stringify(out, null, 1);
})();
