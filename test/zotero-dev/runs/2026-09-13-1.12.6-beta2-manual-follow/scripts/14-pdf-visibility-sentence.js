return (async () => {
  const root = Zotero.__ztts100;
  const slot = root?.pdf;
  const reader = slot?.reader;
  if (!reader) throw new Error('PDF reader is missing');
  const internal = reader._internalReader;
  const manager = internal?._readAloudManager;
  const view = internal?._primaryView;
  const rw = view?._iframeWindow;
  const host = reader._window;
  const container = rw?.document?.getElementById('viewerContainer');
  if (!manager || !view || !rw || !host || !container) throw new Error('PDF view is not ready');
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const originalMode = { value: Services.prefs.getStringPref(modeName, 'sentence'), user: Services.prefs.prefHasUserValue(modeName) };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const readerIndex = () => (Zotero.Reader._readers ?? []).indexOf(reader);
  const diag = () => {
    const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll());
    return all[readerIndex()] ?? null;
  };
  const fragmentBoxes = () => {
    const state = Components.utils.waiveXrays(view._readAloudState);
    const position = Components.utils.waiveXrays(state?.activeSegment)?.sourcePosition;
    const pages = rw.PDFViewerApplication?.pdfViewer?._pages;
    const out = [];
    if (!position || !pages) return out;
    const groups = [{ name: 'head', pageIndex: position.pageIndex, rects: position.rects }, { name: 'nextPage', pageIndex: Number(position.pageIndex) + 1, rects: position.nextPageRects }];
    for (const group of groups) {
      const page = Number.isInteger(group.pageIndex) ? pages[group.pageIndex] : null;
      const list = group.rects;
      if (!page || !list?.length) continue;
      const pageRect = page.div.getBoundingClientRect();
      for (let i = 0; i < list.length; i++) {
        const raw = list[i];
        const p1 = page.viewport.convertToViewportPoint(raw[0], raw[1]);
        const p2 = page.viewport.convertToViewportPoint(raw[2], raw[3]);
        const screen = [pageRect.x + Math.min(p1[0], p2[0]), pageRect.y + Math.min(p1[1], p2[1]), pageRect.x + Math.max(p1[0], p2[0]), pageRect.y + Math.max(p1[1], p2[1])];
        out.push({ group: group.name, pageIndex: group.pageIndex, rectIndex: i, screen, document: [screen[0] + container.scrollLeft, screen[1] + container.scrollTop, screen[2] + container.scrollLeft, screen[3] + container.scrollTop] });
      }
    }
    return out;
  };
  const snapshot = phase => ({
    phase,
    at: Date.now(),
    scrollTop: container.scrollTop,
    scrollLeft: container.scrollLeft,
    viewport: { scrollTop: container.scrollTop, scrollLeft: container.scrollLeft, clientWidth: container.clientWidth, clientHeight: container.clientHeight, scrollWidth: container.scrollWidth, scrollHeight: container.scrollHeight },
    fragments: fragmentBoxes(),
    diagnostic: diag(),
  });
  const wheel = async (deltaY, label) => {
    const events = [];
    const listener = event => events.push({ trusted: !!event.isTrusted, deltaX: event.deltaX, deltaY: event.deltaY, target: String(event.target?.localName ?? '') });
    container.addEventListener('wheel', listener, true);
    const before = snapshot(label + '-before');
    let error = null;
    try { host.windowUtils.sendWheelEvent(Math.round(host.innerWidth / 2), Math.round(host.innerHeight / 2), 0, deltaY, 0, 0, 0, 0, 0, 0); } catch (e) { error = String(e); }
    const immediate = snapshot(label + '-immediate');
    await sleep(80);
    const held = snapshot(label + '-80ms');
    await sleep(280);
    const settled = snapshot(label + '-360ms');
    container.removeEventListener('wheel', listener, true);
    return { label, deltaY, error, events, before, immediate, held, settled, actualDelta: settled.scrollTop - before.scrollTop };
  };
  const returnToReadingPosition = async () => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const ev = (key, code, keyCode, shift = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey: shift });
    tip.beginInputTransactionForTests(rw);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev('Enter', 'Enter', 13, true)), tip.keyup(ev('Enter', 'Enter', 13, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    await sleep(350);
    return { ret, after: snapshot('return-after') };
  };
  let output;
  try {
    Services.prefs.setStringPref(modeName, 'sentence');
    Zotero_Tabs.select(reader.tabID); reader.focus?.(); rw.focus?.();
    try { manager.repositionTo(0); } catch (e) {}
    await sleep(450);
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {}
    container.scrollTo(0, 0);
    await sleep(180);
    const setup = snapshot('setup');
    const partial = await wheel(220, 'partial');
    const returnAfterPartial = await returnToReadingPosition();
    container.scrollTo(0, 0);
    await sleep(180);
    const complete = await wheel(800, 'complete');
    const returnAfterComplete = await returnToReadingPosition();
    output = { mode: 'sentence', setup, partial, returnAfterPartial, complete, returnAfterComplete };
  } finally {
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {}
    try { container.scrollTo(0, 0); } catch (e) {}
    if (originalMode.user) Services.prefs.setStringPref(modeName, originalMode.value); else if (Services.prefs.prefHasUserValue(modeName)) Services.prefs.clearUserPref(modeName);
    await sleep(180);
  }
  return JSON.stringify({ output, restoredMode: { value: Services.prefs.getStringPref(modeName, '<none>'), user: Services.prefs.prefHasUserValue(modeName) }, finalDiagnostic: diag() });
})()
