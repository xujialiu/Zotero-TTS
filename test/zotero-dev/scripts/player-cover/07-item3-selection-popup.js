// Item 3 (PDF, #137): Zotero's popups sit by their text. With the Top bar
// and then the Bottom bar, raise the selection popup with
// view._setSelectionRanges(...) (the call a mouse selection ends in -- a
// DOM Selection raises none on desktop, PDFNativeTextSelection being
// mobile-only). Measure the popup's top minus the selected word's top with
// the player open, then closed. Both differences must be equal (0.00 px
// apart); the pre-fix research fixture measured 40.97 closed vs 6.97 open.
(async () => {
  const kind = 'pdf';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const state = Zotero.ZoteroTTSRun.state;
  const itemID = state.fixtures[kind].itemID;
  const host = Zotero.getMainWindow();
  let reader = null;
  for (const r of Zotero.Reader._readers || []) if (r.itemID === itemID) reader = r;
  if (!reader) throw new Error('pdf reader not found');
  host.Zotero_Tabs.select(reader.tabID);
  await sleep(150);
  const doc = reader._iframeWindow.document;
  const ir = reader._internalReader;
  const view = ir._primaryView;
  const rw = view._iframeWindow;
  const vw = Components.utils.waiveXrays(view);
  const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width }; };
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';

  const setLayout = async (layout) => { Zotero.ZoteroTTS.pluginPlayer.setLayout(layout); await wait(() => Services.prefs.getStringPref(layoutPref, '') === layout ? true : null, 5000); await sleep(150); };
  const openPlayer = async () => {
    ir.toggleReadAloudPopup(true);
    const m = await wait(() => ir._readAloudManager?.active ? ir._readAloudManager : null, 8000);
    if (!m) throw new Error('manager did not activate');
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    await wait(() => m.paused ? true : null, 3000);
    await wait(() => { const f = doc.querySelector('#ztts-player-frame'); return f && !f.hidden && f.getAttribute('data-layout') === Services.prefs.getStringPref(layoutPref, '') ? true : null; }, 8000);
    await sleep(150);
  };
  const closePlayer = async () => { ir.toggleReadAloudPopup(false); await wait(() => !ir._readAloudManager?.active ? true : null, 8000); await sleep(150); };

  const wordRect = () => {
    const layer = rw.document.querySelectorAll('.textLayer')[0];
    const span = layer.querySelectorAll('span')[0];
    const textNode = span.firstChild;
    const text = String(textNode.textContent);
    const start = text.indexOf('fixture');
    if (start < 0) throw new Error('word "fixture" not found in first span: ' + text);
    const range = rw.document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + 'fixture'.length);
    const r = range.getBoundingClientRect();
    const pdfIframeRect = rectOf(doc.querySelector('#split-view #primary-view iframe'));
    return { top: pdfIframeRect.top + r.top, bottom: pdfIframeRect.top + r.bottom, left: pdfIframeRect.left + r.left, right: pdfIframeRect.left + r.right };
  };
  const raiseSelectionPopup = async () => {
    await ir._loadSDT();
    const segs = ir._readAloudSegments.segments;
    const seg0 = segs[0];
    const spans = ir._readAloudSegments.getSegmentTextSpans(seg0) || [];
    const span = spans.find((s) => s && s.node && Number.isInteger(s.start) && Number.isInteger(s.end));
    const full = String(span.node.text || '');
    const idx = full.indexOf('fixture');
    const raw = [{ ref: JSON.parse(JSON.stringify(span.ref)), node: JSON.parse(JSON.stringify(span.node)), start: idx, end: idx + 'fixture'.length }];
    const position = ir._sdt.mapper.textNodeSpansToSourcePosition(Components.utils.cloneInto(raw, rw));
    const range = { pageIndex: position.pageIndex, anchorOffset: 0, headOffset: 'fixture'.length, collapsed: false, anchor: true, head: true, sortIndex: '00000|00000|00000', position: JSON.parse(JSON.stringify(position)), text: 'fixture' };
    vw._setSelectionRanges(Components.utils.cloneInto([range], rw));
    const popup = await wait(() => doc.querySelector('.selection-popup'), 4000);
    await sleep(150);
    return popup;
  };
  const clearSelection = async () => { try { vw._setSelectionRanges(undefined); } catch (e) {} try { rw.getSelection().removeAllRanges(); } catch (e) {} await wait(() => !doc.querySelector('.selection-popup') ? true : null, 3000); };

  const rounds = {};
  for (const layout of ['top', 'A']) {
    await setLayout(layout);
    await openPlayer();
    await clearSelection();
    const wOpen = wordRect();
    const popupOpen = await raiseSelectionPopup();
    const popupOpenRect = rectOf(popupOpen);
    const openDiff = popupOpenRect ? popupOpenRect.top - wOpen.top : null;

    await closePlayer();
    await sleep(150);
    const wClosed = wordRect(); // re-derived: the pdf iframe would have moved before this fix
    const popupClosed = doc.querySelector('.selection-popup'); // the same, already-open popup
    const popupClosedRect = rectOf(popupClosed);
    const closedDiff = popupClosedRect ? popupClosedRect.top - wClosed.top : null;

    rounds[layout] = {
      wordRectOpen: wOpen, popupOpenRect, openDiff,
      wordRectClosed: wClosed, popupStillOpenAfterClose: !!popupClosed, popupClosedRect, closedDiff,
      equalOpenVsClosed: openDiff !== null && closedDiff !== null && Math.abs(openDiff - closedDiff) < 0.5,
    };
    await clearSelection();
    // Reopen for the next round / later items (Top layout at the very end).
    await openPlayer();
  }
  await setLayout('top');

  return JSON.stringify({ rounds }, null, 1);
})();
