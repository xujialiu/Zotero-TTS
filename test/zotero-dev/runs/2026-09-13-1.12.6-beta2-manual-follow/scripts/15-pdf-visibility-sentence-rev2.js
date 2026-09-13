return (async () => {
  const root = Zotero.__ztts100;
  const reader = root?.pdf?.reader;
  if (!reader) throw new Error('PDF reader is missing');
  const internal = reader._internalReader, manager = internal?._readAloudManager, view = internal?._primaryView, rw = view?._iframeWindow, host = reader._window, container = rw?.document?.getElementById('viewerContainer');
  if (!manager || !view || !rw || !host || !container) throw new Error('PDF view is not ready');
  const pref = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const original = { value: Services.prefs.getStringPref(pref, 'sentence'), user: Services.prefs.prefHasUserValue(pref) };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const index = () => (Zotero.Reader._readers ?? []).indexOf(reader);
  const diagnostic = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll())[index()] ?? null;
  const fragments = () => {
    const state = Components.utils.waiveXrays(view._readAloudState), position = Components.utils.waiveXrays(state?.activeSegment)?.sourcePosition, pages = rw.PDFViewerApplication?.pdfViewer?._pages, result = [];
    if (!position || !pages) return result;
    for (const g of [{ name: 'head', page: position.pageIndex, list: position.rects }, { name: 'nextPage', page: Number(position.pageIndex) + 1, list: position.nextPageRects }]) {
      const p = Number.isInteger(g.page) ? pages[g.page] : null;
      if (!p || !g.list?.length) continue;
      const pr = p.div.getBoundingClientRect();
      for (let i = 0; i < g.list.length; i++) {
        const q = g.list[i], a = p.viewport.convertToViewportPoint(q[0], q[1]), b = p.viewport.convertToViewportPoint(q[2], q[3]);
        const screen = [pr.x + Math.min(a[0], b[0]), pr.y + Math.min(a[1], b[1]), pr.x + Math.max(a[0], b[0]), pr.y + Math.max(a[1], b[1])];
        result.push({ group: g.name, page: g.page, rect: i, screen, document: [screen[0] + container.scrollLeft, screen[1] + container.scrollTop, screen[2] + container.scrollLeft, screen[3] + container.scrollTop] });
      }
    }
    return result;
  };
  const snap = phase => { const d = diagnostic(); return { phase, at: Date.now(), scrollTop: container.scrollTop, scrollLeft: container.scrollLeft, viewport: d?.viewport ?? null, sentence: d?.sentence ?? null, part: d?.part ?? null, fragments: fragments(), following: d?.following ?? null, interacting: d?.interacting ?? null, pending: d?.pending ?? null, visible: d?.visible ?? null, reason: d?.reason ?? null, last: d?.last ?? null }; };
  const trustedWheel = async (deltaY, label) => {
    const events = [], listener = e => events.push({ trusted: !!e.isTrusted, deltaX: e.deltaX, deltaY: e.deltaY, target: String(e.target?.localName ?? '') });
    container.addEventListener('wheel', listener, true);
    const before = snap(label + '-before');
    let error = null;
    try { const frame = rw.frameElement.getBoundingClientRect(); host.windowUtils.sendWheelEvent(Math.round(frame.x + 100), Math.round(frame.y + Math.min(500, frame.height / 2)), 0, deltaY, 0, 0, 0, 0, 0, 0); } catch (e) { error = String(e); }
    const immediate = snap(label + '-immediate');
    await sleep(80);
    const held = snap(label + '-80ms');
    await sleep(280);
    const settled = snap(label + '-360ms');
    container.removeEventListener('wheel', listener, true);
    return { label, deltaY, error, events, before, immediate, held, settled, actualDelta: settled.scrollTop - before.scrollTop };
  };
  const explicitReturn = async label => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor), K = rw.KeyboardEvent;
    const ev = (key, code, keyCode, shift = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey: shift });
    tip.beginInputTransactionForTests(rw);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev('Enter', 'Enter', 13, true)), tip.keyup(ev('Enter', 'Enter', 13, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    await sleep(350);
    return { label, ret, after: snap(label + '-after') };
  };
  let output = null;
  try {
    Services.prefs.setStringPref(pref, 'sentence');
    Zotero_Tabs.select(reader.tabID); reader.focus?.(); rw.focus?.();
    try { manager.repositionTo(0); } catch (e) {}
    await sleep(450);
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {}
    container.scrollTo(0, 0); await sleep(180);
    const setup = snap('setup');
    container.scrollTo(0, 700); await sleep(260);
    const automaticOnly = snap('automatic-scroll-only');
    await explicitReturn('return-after-automatic');
    container.scrollTo(0, 0); await sleep(180);
    const partial = await trustedWheel(220, 'partial');
    const returnAfterPartial = await explicitReturn('return-after-partial');
    container.scrollTo(0, 0); await sleep(180);
    const complete = await trustedWheel(800, 'complete');
    const returnAfterComplete = await explicitReturn('return-after-complete');
    output = { mode: 'sentence', setup, automaticOnly, partial, returnAfterPartial, complete, returnAfterComplete };
  } finally {
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {}
    try { container.scrollTo(0, 0); } catch (e) {}
    if (original.user) Services.prefs.setStringPref(pref, original.value); else if (Services.prefs.prefHasUserValue(pref)) Services.prefs.clearUserPref(pref);
    await sleep(180);
  }
  return JSON.stringify({ output, restoredMode: { value: Services.prefs.getStringPref(pref, '<none>'), user: Services.prefs.prefHasUserValue(pref) }, final: snap('final') });
})()
