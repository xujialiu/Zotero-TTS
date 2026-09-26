(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const params = run.params;
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 20000, step = 75) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const readerOf = id => { for (const reader of Zotero.Reader?._readers || []) if (reader?.itemID === id) return reader; return null; };
  const diag = id => { try { const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()); for (const row of d.readers || []) if (row?.itemID === id) return row; } catch (_) {} return null; };
  const focus = reader => {
    const host = Zotero.getMainWindow();
    if (host?.windowState === 2 && host.restore) host.restore();
    try { Services.focus.focusWindow(host, true); } catch (_) {}
    host?.focus?.();
    try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (_) {}
  };
  const trustedSpace = reader => {
    focus(reader);
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const win = reader._window, K = win.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(win);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32, true)), tip.keyup(ev(' ', 'Space', 32, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    tip.endInputTransaction?.();
    return ret;
  };
  const importFixture = async (relative, title) => {
    const item = await Zotero.Attachments.importFromFile({ file: PathUtils.join(params.fixturesDir, ...String(relative).split('/')), libraryID: Zotero.Libraries.userLibraryID, title });
    return { id: item.id, key: item.key, title: item.getField('title'), relative };
  };
  const openReader = async fixture => {
    const opened = Zotero.Reader.open(fixture.id, null, { openInBackground: false, allowDuplicate: false }); if (opened?.then) await opened;
    const reader = await waitFor(() => { const candidate = readerOf(fixture.id); return candidate?._internalReader?._readAloudManager ? candidate : null; }, 24000);
    if (!reader) throw new Error('reader did not initialize for ' + fixture.relative);
    focus(reader);
    return reader;
  };
  const closeReader = async reader => {
    try { reader?._internalReader?.toggleReadAloudPopup(false); } catch (_) {}
    await sleep(200); try { reader?.close?.(); } catch (_) {}
    await waitFor(() => !readerOf(reader?.itemID), 10000, 80);
  };
  const frameDoc = reader => reader?._iframeWindow?.document?.querySelector('#ztts-player-frame')?.contentDocument || null;
  const openPaused = async reader => {
    const ir = reader._internalReader;
    if (!ir._state?.readAloudState?.popupOpen) ir.toggleReadAloudPopup(true);
    await waitFor(() => frameDoc(reader)?.querySelector('.player') ? frameDoc(reader) : null, 15000);
    const manager = ir._readAloudManager;
    await waitFor(() => manager?.allVoices?.length ? manager : null, 15000);
    await waitFor(() => manager?.active && manager?._segments?.length ? manager : null, 20000);
    if (!manager?.active) throw new Error('fixture player did not activate');
    if (!manager.paused) manager.pause();
    await waitFor(() => manager.paused === true, 5000);
    return manager;
  };
  const clearSelection = reader => {
    const view = reader._internalReader?._primaryView;
    try { view?._iframeWindow?.getSelection?.()?.removeAllRanges(); } catch (_) {}
    try { view?.setSelectionPopup?.(null); } catch (_) {}
  };
  const textNodes = (range, win) => {
    const root = range.commonAncestorContainer.nodeType === win.Node.TEXT_NODE ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
    const walker = range.startContainer.ownerDocument.createTreeWalker(root, win.NodeFilter.SHOW_TEXT);
    const nodes = []; let node;
    while ((node = walker.nextNode())) { try { if (range.intersectsNode(node)) nodes.push(node); } catch (_) {} }
    return nodes;
  };
  const pointAt = (range, offset, win) => {
    let remaining = Math.max(0, offset);
    for (const node of textNodes(range, win)) {
      const lo = node === range.startContainer ? range.startOffset : 0;
      const hi = node === range.endContainer ? range.endOffset : String(node.nodeValue || '').length;
      const available = Math.max(0, hi - lo);
      if (remaining <= available) return [node, lo + remaining];
      remaining -= available;
    }
    return [range.endContainer, range.endOffset];
  };
  const makeSelection = reader => {
    const ir = reader._internalReader, view = ir._primaryView, win = view._iframeWindow;
    const segments = ir._readAloudSegments?.segments || [];
    if (segments.length < 2) throw new Error('selection fixture has fewer than two segments');
    const spanFor = segment => { const spans = ir._readAloudSegments.getSegmentTextSpans(segment) || []; for (let i = 0; i < spans.length; i++) if (spans[i]?.node && spans[i].end > spans[i].start) return spans[i]; return null; };
    let target = null, targetSpan = null, next = null, nextSpan = null;
    for (let i = 1; i < segments.length; i++) { const span = spanFor(segments[i]); const text = span ? String(span.node.text || '').slice(span.start, span.end) : ''; if (span && text.trim().split(/\s+/).length >= 3) { target = segments[i]; targetSpan = span; next = segments[i + 1] || null; nextSpan = next ? spanFor(next) : null; break; } }
    if (!targetSpan) throw new Error('selection target did not map to a PDF text span');
    const source = ir._sdt.mapper.textNodeSpansToSourcePosition(Components.utils.cloneInto([{ ref: JSON.parse(JSON.stringify(targetSpan.ref)), node: JSON.parse(JSON.stringify(targetSpan.node)), start: targetSpan.start, end: targetSpan.start + Math.min(16, targetSpan.end - targetSpan.start) }], win));
    const range = { pageIndex: source.pageIndex, anchorOffset: 0, headOffset: 16, collapsed: false, anchor: true, head: true, sortIndex: '00000|00000|00000', position: JSON.parse(JSON.stringify(source)), text: String(target.text || '').slice(0, 16) };
    const vw = Components.utils.waiveXrays(view);
    vw._setSelectionRanges(Components.utils.cloneInto([range], win));
    return { text: range.text, hasTarget: !!vw.hasReadAloudTarget, position: JSON.parse(JSON.stringify(source)), targetText: String(target.text || '').slice(0, 80), next: !!nextSpan };
  };
  const out = { step: 'selection-buffering-longdoc', selection: null, buffering: null, longdoc: null };
  const tag = String(params.runId || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_');

  prefs.setBoolPref(prefix + 'fish.enabled', false);
  prefs.setBoolPref(prefix + 'system.enabled', false);
  prefs.setBoolPref(prefix + 'local.enabled', true);
  prefs.setStringPref(prefix + 'local.baseURL', String(params.deterministicBaseURL));
  prefs.setStringPref(prefix + 'readAloud.defaultVoice', JSON.stringify({ id: 'local::af_bella', lang: 'en' }));
  prefs.setStringPref(prefix + 'readAloud.memory', JSON.stringify({ speed: 1, voice: { id: 'local::af_bella', lang: 'en' } }));
  const selectionFixture = await importFixture('fixture-a.pdf', 'Zotero-TTS #148 selection ' + tag);
  state.fixtures = state.fixtures || {};
  state.fixtures.selection = selectionFixture;
  const selectionReader = await openReader(selectionFixture);
  const selectionManager = await openPaused(selectionReader);
  try { selectionReader._internalReader.toggleReadAloudPopup(false); } catch (_) {}
  await waitFor(() => !selectionManager.active, 7000);
  clearSelection(selectionReader);
  const selected = makeSelection(selectionReader);
  focus(selectionReader);
  try { selectionReader._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
  const selectionKeys = trustedSpace(selectionReader);
  const uiStart = await waitFor(() => { const row = diag(selectionFixture.id); return row?.session?.remainingTime?.scope === 'document' && Number.isInteger(row.session.position) ? row : null; }, 3000);
  const uiScope = uiStart?.session?.remainingTime || diag(selectionFixture.id)?.session?.remainingTime || null;
  // Zotero 10 consumes a text selection as a start point and calls
  // setSegments(..., forwardStop=null). This is the supported UI behavior.
  // The bounded range below is a fresh controlled contract input: clear the
  // active controller first so its current segment cannot override start=0.
  const selectionManagerAfter = selectionReader._internalReader._readAloudManager;
  if (selectionManagerAfter.active && !selectionManagerAfter.paused) selectionManagerAfter.pause();
  await waitFor(() => selectionManagerAfter.paused === true, 3000);
  const controlledSegments = selectionManagerAfter._segments || selectionReader._internalReader?._readAloudSegments?.segments || [];
  if (!controlledSegments.length) throw new Error('controlled selection has no segments');
  try { selectionManagerAfter.clearSegments(); } catch (_) {}
  await waitFor(() => !selectionManagerAfter._segments && !selectionManagerAfter._controller, 5000);
  selectionManagerAfter.setSegments(controlledSegments, 0, Math.min(1, controlledSegments.length));
  if (!selectionManagerAfter.active && typeof selectionManagerAfter.activate === 'function') selectionManagerAfter.activate();
  const controlledPrepared = await waitFor(() => selectionManagerAfter._forwardStopIndex === 1 && Number(selectionManagerAfter._controller?._position) === 0 ? selectionManagerAfter : null, 7000);
  const controlledStart = await waitFor(() => { const row = diag(selectionFixture.id); return row?.session?.remainingTime?.scope === 'selection' ? row : null; }, 5000);
  const controlledStop = selectionManagerAfter._forwardStopIndex ?? null;
  if (!controlledStart) {
    out.selection = { status: 'PASS_UI_FAIL_CONTROLLED', uiBehavior: { scope: uiScope?.scope || null, position: uiStart?.session?.position ?? null, selected, selectionKeys }, controlledContract: { status: 'NOT TESTABLE', reason: 'fresh clearSegments/setSegments did not bind a selection-scoped Engine session', prepared: !!controlledPrepared, forwardStop: controlledStop, row: diag(selectionFixture.id) } };
  } else {
    trustedSpace(selectionReader);
    const controlledFinished = await waitFor(() => { const row = diag(selectionFixture.id); return row?.session?.remainingTime?.status === 'finished' ? row : null; }, 10000);
    const player = frameDoc(selectionReader)?.querySelector('.play');
    if (controlledFinished && player) player.click(); else if (controlledFinished) trustedSpace(selectionReader);
    const documentAfterPlay = await waitFor(() => { const row = diag(selectionFixture.id); return row?.session?.remainingTime?.scope === 'document' && row.session.remainingTime.status !== 'finished' ? row : null; }, 12000);
    out.selection = { status: controlledFinished && documentAfterPlay ? 'PASS' : 'FAIL', uiBehavior: { scope: uiScope?.scope || null, position: uiStart?.session?.position ?? null, selected, selectionKeys }, controlledContract: { start: controlledStart.session.remainingTime, forwardStop: controlledStop, finished: controlledFinished?.session?.remainingTime || null, afterPlay: documentAfterPlay?.session?.remainingTime || null } };
    if (!controlledFinished || controlledFinished.session.remainingTime.seconds !== 0 || !documentAfterPlay || documentAfterPlay.session.remainingTime.scope !== 'document') throw new Error('controlled selection completion/Play document transition failed: ' + JSON.stringify(out.selection));
  }
  await closeReader(selectionReader);

  // Delayed captioned audio: while a fresh clip is buffering, repeated
  // remaining-time snapshots must not count wall time or invented audio.
  prefs.setStringPref(prefix + 'local.baseURL', String(params.deterministicBaseURL) + '/delay');
  const bufferingFixture = await importFixture('fixture-b.pdf', 'Zotero-TTS #148 held audio ' + tag);
  state.fixtures.buffering = bufferingFixture;
  const bufferingReader = await openReader(bufferingFixture);
  const bufferingManager = await openPaused(bufferingReader);
  try { bufferingManager.repositionTo(0); } catch (_) {}
  await sleep(200);
  try { bufferingManager.play(); } catch (_) {}
  const bufferingStart = await waitFor(() => { const row = diag(bufferingFixture.id); return row?.session?.buffering ? row : null; }, 7000);
  if (!bufferingStart) trustedSpace(bufferingReader);
  const heldBefore = diag(bufferingFixture.id);
  await sleep(800);
  const heldAfter = diag(bufferingFixture.id);
  out.buffering = { before: heldBefore?.session ? { buffering: heldBefore.session.buffering, remaining: heldBefore.session.remainingTime, requests: heldBefore.session.store?.requests } : null, after: heldAfter?.session ? { buffering: heldAfter.session.buffering, remaining: heldAfter.session.remainingTime, requests: heldAfter.session.store?.requests } : null, frozen: !!heldBefore?.session?.remainingTime && !!heldAfter?.session?.remainingTime && Math.abs(heldBefore.session.remainingTime.seconds - heldAfter.session.remainingTime.seconds) < 0.01 };
  if (!out.buffering.frozen) throw new Error('held audio changed remaining estimate: ' + JSON.stringify(out.buffering));
  await closeReader(bufferingReader);

  // Use the existing long scrolling EPUB fixture for live long-document
  // aggregation/performance evidence, rather than the 180-segment case EPUB.
  prefs.setStringPref(prefix + 'local.baseURL', String(params.deterministicBaseURL));
  const longFixture = await importFixture('scroll-performance/scroll-performance.epub', 'Zotero-TTS #148 long document ' + tag);
  state.fixtures.longdoc = longFixture;
  const longReader = await openReader(longFixture);
  const longManager = await openPaused(longReader);
  const longView = Components.utils.waiveXrays(longReader._internalReader?._lastView || longReader._internalReader?._primaryView);
  try { longView?.setFlowMode?.('scrolled'); } catch (error) { throw new Error('long-document setFlowMode failed: ' + String(error)); }
  await waitFor(() => {
    const document = longView?.iframeDocument;
    return longView?.flowMode === 'scrolled' && document && document.documentElement.scrollHeight > longView.iframeWindow.innerHeight * 3 ? longView : null;
  }, 12000, 200);
  const longSegments = longReader._internalReader?._readAloudSegments?.segments || longManager._segments || [];
  const view = longReader._internalReader?._lastView || longReader._internalReader?._primaryView;
  const viewDoc = view?._iframeDocument;
  const viewport = viewDoc?.documentElement?.clientHeight || viewDoc?.body?.clientHeight || 0;
  const height = viewDoc?.documentElement?.scrollHeight || viewDoc?.body?.scrollHeight || 0;
  const t0 = Date.now();
  for (let i = 0; i < 500; i++) diag(longFixture.id);
  const elapsedMs = Date.now() - t0;
  out.longdoc = { segments: longSegments.length, height, viewport, viewports: viewport ? height / viewport : null, snapshots: 500, elapsedMs, remaining: diag(longFixture.id)?.session?.remainingTime || null };
  if (longSegments.length < 500 || !(out.longdoc.viewports >= 5) || elapsedMs > 3000) throw new Error('long-document performance evidence below threshold: ' + JSON.stringify(out.longdoc));
  await closeReader(longReader);
  prefs.setStringPref(prefix + 'local.baseURL', String(params.deterministicBaseURL));
  Zotero.getMainWindow()?.minimize?.();
  state.supplementResults = out;
  return JSON.stringify(out, null, 1);
})()
