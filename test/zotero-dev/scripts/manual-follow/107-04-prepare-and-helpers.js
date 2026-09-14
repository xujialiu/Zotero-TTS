return (async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const read = suffix => {
    const name = prefix + suffix;
    const type = p.getPrefType(name);
    const user = p.prefHasUserValue(name);
    let value = null;
    try {
      if (type === p.PREF_BOOL) value = p.getBoolPref(name);
      else if (type === p.PREF_INT) value = p.getIntPref(name);
      else if (type === p.PREF_STRING) value = p.getStringPref(name);
    } catch (e) {}
    return { type, user, value };
  };
  const savedMemory = read('readAloud.memory');
  let memoryVoice = null;
  try { memoryVoice = JSON.parse(String(savedMemory.value)).voice?.id ?? null; } catch (e) {}
  const pluginVoice = typeof memoryVoice === 'string' && memoryVoice.includes('::');
  state.safeToOpen = pluginVoice;
  state.prepare = {
    memoryVoice: pluginVoice ? memoryVoice : null,
    memoryVoiceChars: typeof savedMemory.value === 'string' ? savedMemory.value.length : null,
    volumeBefore: read('readAloud.volume'),
    syncBefore: {
      positions: read('webdav.syncPositions'),
      upload: read('webdav.autoUploadSettings'),
      settings: read('webdav.syncSettings'),
    },
  };
  p.setBoolPref(prefix + 'webdav.syncPositions', false);
  p.setBoolPref(prefix + 'webdav.autoUploadSettings', false);
  p.setBoolPref(prefix + 'webdav.syncSettings', false);
  p.setIntPref(prefix + 'readAloud.volume', 0);
  const debugBefore = !!Zotero.Debug?.storing;
  if (!debugBefore) try { Zotero.Debug.setStore(true); } catch (e) {}

  const S = state;
  const h = {};
  h.sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  h.safe = fn => { try { return fn(); } catch (e) { return null; } };
  h.reader = slot => {
    if (!slot?.itemID) return null;
    let found = null;
    for (const reader of Zotero.Reader._readers || []) {
      try { if (reader?.itemID === slot.itemID) { found = reader; break; } } catch (e) {}
    }
    // A reader wrapper can remain in state for one tick after Zotero removes
    // its tab. Never hand that dead wrapper to the next script.
    slot.reader = found;
    return found;
  };
  h.internal = slot => { try { return h.reader(slot)?._internalReader || null; } catch (e) { return null; } };
  h.manager = slot => { try { return h.internal(slot)?._readAloudManager || null; } catch (e) { return null; } };
  h.view = slot => { try { return h.internal(slot)?._primaryView || null; } catch (e) { return null; } };
  h.select = slot => {
    const reader = h.reader(slot);
    if (!reader) return null;
    try { Zotero_Tabs.select(reader.tabID); } catch (e) {}
    try { reader.focus?.(); } catch (e) {}
    try { h.view(slot)?._iframeWindow?.focus?.(); } catch (e) {}
    return reader;
  };
  h.diag = (slot, name = 'autoScroll') => {
    const reader = h.reader(slot);
    if (!reader || !Zotero.ZoteroTTS?.diagnostics?.[name]) return { error: 'reader or diagnostic missing' };
    try {
      const all = JSON.parse(Zotero.ZoteroTTS.diagnostics[name]());
      let index = -1;
      let i = 0;
      for (const candidate of Zotero.Reader._readers || []) { if (candidate === reader) { index = i; break; } i++; }
      return index >= 0 ? (all[index] || null) : null;
    } catch (e) { return { error: String(e) }; }
  };
  h.position = slot => {
    const internal = h.internal(slot), manager = h.manager(slot), view = h.view(slot);
    let segment = null, stateValue = null;
    try { segment = Components.utils.waiveXrays(view?._readAloudState?.activeSegment); } catch (e) {}
    if (!segment) try { segment = Components.utils.waiveXrays(manager?._activeSegment); } catch (e) {}
    try { stateValue = Components.utils.waiveXrays(view?._readAloudState); } catch (e) {}
    if (!segment) try { segment = stateValue?.segments?.[manager?._controller?._position] || null; } catch (e) {}
    if (!segment) try { segment = manager?._segments?.[manager?._controller?._position] || null; } catch (e) {}
    try { return segment?.sourcePosition ? JSON.parse(JSON.stringify(segment.sourcePosition)) : null; } catch (e) { return null; }
  };
  h.pdfGeometry = slot => {
    const view = h.view(slot), win = view?._iframeWindow, container = win?.document?.getElementById('viewerContainer');
    const position = h.position(slot);
    if (!view || !win || !container || !position) return { kind: 'pdf', boxes: [], viewport: null, error: 'geometry unavailable' };
    const pages = win.PDFViewerApplication?.pdfViewer?._pages || [];
    const cr = container.getBoundingClientRect();
    const boxes = [];
    const groups = [
      { name: 'head', page: position.pageIndex, list: position.rects },
      { name: 'nextPage', page: Number(position.pageIndex) + 1, list: position.nextPageRects },
    ];
    for (const group of groups) {
      const page = Number.isInteger(group.page) ? pages[group.page] : null;
      if (!page || !group.list?.length) continue;
      const pr = page.div.getBoundingClientRect();
      for (let i = 0; i < group.list.length; i++) {
        const q = group.list[i];
        const a = page.viewport.convertToViewportPoint(q[0], q[1]);
        const b = page.viewport.convertToViewportPoint(q[2], q[3]);
        const screen = [pr.x + Math.min(a[0], b[0]), pr.y + Math.min(a[1], b[1]), pr.x + Math.max(a[0], b[0]), pr.y + Math.max(a[1], b[1])];
        boxes.push({ group: group.name, page: group.page, index: i, screen, visible: screen[2] > cr.left && screen[3] > cr.top && screen[0] < cr.right && screen[1] < cr.bottom });
      }
    }
    return { kind: 'pdf', boxes, viewport: { left: cr.left, top: cr.top, right: cr.right, bottom: cr.bottom, width: container.clientWidth, height: container.clientHeight, scrollTop: container.scrollTop, maxScrollTop: Math.max(0, container.scrollHeight - container.clientHeight) } };
  };
  h.epubGeometry = slot => {
    const view = h.view(slot), helper = view && Components.utils.waiveXrays(view._readAloud), win = view?.iframeWindow, doc = view?.iframeDocument;
    if (!view || !helper || !win || !doc) return { kind: 'epub', boxes: [], viewport: null, error: 'geometry unavailable' };
    let selector = null, range = null;
    try {
      const current = Components.utils.waiveXrays(helper.state);
      selector = helper._resolveSegmentSelector(current);
      if (!selector) {
        const position = h.position(slot);
        if (position && typeof helper._positionToSelector === 'function') selector = helper._positionToSelector(position);
      }
      range = selector ? view.toDisplayedRange(selector) : null;
    } catch (e) { return { kind: 'epub', boxes: [], viewport: null, error: String(e) }; }
    const list = range?.getClientRects?.();
    const width = doc.documentElement.clientWidth || win.innerWidth;
    const height = doc.documentElement.clientHeight || win.innerHeight;
    const boxes = [];
    for (let i = 0; list && i < list.length; i++) {
      const b = list[i];
      boxes.push({ index: i, screen: [b.left, b.top, b.right, b.bottom], document: [b.left + win.scrollX, b.top + win.scrollY, b.right + win.scrollX, b.bottom + win.scrollY], visible: b.right > 0 && b.bottom > 0 && b.left < width && b.top < height });
    }
    const root = doc.scrollingElement || doc.documentElement;
    return { kind: 'epub', flow: view.flowMode, selector: selector ? JSON.stringify(selector).slice(0, 220) : null, boxes, viewport: { left: 0, top: 0, right: width, bottom: height, width, height, scrollY: win.scrollY, maxScrollY: Math.max(0, root.scrollHeight - height) } };
  };
  h.geometry = slot => h.view(slot)?.flowMode === 'pdf' || h.view(slot)?._iframeWindow?.PDFViewerApplication ? h.pdfGeometry(slot) : h.epubGeometry(slot);
  h.snap = (slot, label) => {
    const reader = h.reader(slot), internal = h.internal(slot), manager = h.manager(slot), view = h.view(slot), d = h.diag(slot), sv = h.diag(slot, 'sentenceInView'), geometry = h.geometry(slot);
    const controller = manager?._controller;
    return {
      label, at: Date.now(), itemID: slot?.itemID ?? null, tabID: reader?.tabID ?? null,
      active: !!manager?.active, paused: !!manager?.paused, position: Number.isFinite(controller?._position) ? controller._position : null,
      flow: view?.flowMode ?? null, geometry,
      visibleFragments: geometry?.boxes?.filter(box => box.visible).length ?? null,
      autoScroll: d, sentenceInView: sv,
      following: d?.following ?? sv?.following ?? null, pausedDiagnostic: d?.paused ?? sv?.paused ?? null,
      sentenceProtected: d?.sentenceProtected ?? sv?.sentenceProtected ?? null,
      interacting: d?.interacting ?? sv?.interacting ?? null, visibilityPaused: d?.visibilityPaused ?? sv?.visibilityPaused ?? null,
      pending: d?.pending ?? sv?.pending ?? null, reason: d?.reason ?? sv?.reason ?? null, last: d?.last ?? sv?.last ?? null,
    };
  };
  h.activeSegment = slot => {
    const manager = h.manager(slot), view = h.view(slot);
    try { return Components.utils.waiveXrays(view?._readAloudState?.activeSegment) || Components.utils.waiveXrays(manager?._activeSegment) || null; } catch (e) { return null; }
  };
  h.setSegment = async (slot, index) => {
    const manager = h.manager(slot);
    if (!manager?._segments?.[index]) return { index, error: 'segment missing' };
    let error = null;
    try {
      manager._activeSegment = manager._segments[index];
      try { manager._controller._position = index; } catch (e) {}
      manager._stateChanged?.();
    } catch (e) { error = String(e); }
    await h.sleep(220);
    return { index, text: String(manager._segments[index]?.text || '').slice(0, 100), error };
  };
  h.pause = async slot => {
    const manager = h.manager(slot);
    let error = null;
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) { error = String(e); }
    await h.sleep(180);
    return { error, active: !!manager?.active, paused: !!manager?.paused };
  };
  h.statePushes = async (slot, count = 3, label = 'state-push') => {
    const manager = h.manager(slot), rows = [];
    for (let i = 0; i < count; i++) {
      let error = null;
      try { manager?._stateChanged?.(); } catch (e) { error = String(e); }
      await h.sleep(140);
      rows.push({ error, snapshot: h.snap(slot, `${label}-${i + 1}`) });
    }
    return rows;
  };
  h.scroll = (slot, target) => {
    const view = h.view(slot), geometry = h.geometry(slot);
    if (geometry?.kind === 'pdf') {
      const c = view?._iframeWindow?.document?.getElementById('viewerContainer');
      if (c) { c.scrollTop = target; return c.scrollTop; }
    } else {
      try {
        view?.iframeWindow?.scrollTo(0, target);
        const root = view.iframeDocument?.scrollingElement || view.iframeDocument?.documentElement;
        if (root) root.scrollTop = target;
        return view.iframeWindow.scrollY;
      } catch (e) {}
    }
    return null;
  };
  h.maxScroll = slot => {
    const g = h.geometry(slot);
    return g?.viewport?.maxScrollTop ?? g?.viewport?.maxScrollY ?? 0;
  };
  h.arrange = (slot, desired) => {
    const g = h.geometry(slot);
    if (!g?.boxes?.length || !g.viewport) return { desired, arranged: false, reason: 'no geometry', before: g };
    const visible = g.boxes.filter(box => box.visible).length;
    const whole = [Math.min(...g.boxes.map(box => box.screen[0])), Math.min(...g.boxes.map(box => box.screen[1])), Math.max(...g.boxes.map(box => box.screen[2])), Math.max(...g.boxes.map(box => box.screen[3]))];
    if (g.kind === 'epub' && g.flow === 'paginated') {
      return { desired, arranged: desired === 'visible' && visible > 0, method: 'current-spread', before: g, note: desired === 'partial' ? 'partial depends on a spread-crossing sentence' : desired === 'outside' ? 'outside arranged by page navigation in resume script' : null };
    }
    const current = g.kind === 'pdf' ? g.viewport.scrollTop : g.viewport.scrollY;
    const height = g.viewport.height;
    const top = g.kind === 'pdf' ? g.viewport.top : 0;
    const max = g.kind === 'pdf' ? g.viewport.maxScrollTop : g.viewport.maxScrollY;
    let target = current;
    if (desired === 'visible') target = current + ((whole[1] + whole[3]) / 2 - (top + height / 2));
    // Put roughly half the sentence above the viewport so a clipped whole
    // sentence is measured as partial, even for a one-line fixture sentence.
    if (desired === 'partial') target = current + (whole[1] - top + (whole[3] - whole[1]) / 2);
    // Scroll down until the sentence's bottom is above the viewport. The
    // previous expression used the viewport bottom and therefore clamped a
    // sentence near the document top back to zero.
    if (desired === 'outside') target = current + (whole[3] - top + 120);
    target = Math.max(0, Math.min(max, Math.round(target)));
    const actual = h.scroll(slot, target);
    return { desired, arranged: true, target, actual, before: g, after: h.geometry(slot) };
  };
  h.trustedWheel = (slot, label = 'wheel') => {
    const reader = h.reader(slot), view = h.view(slot), g = h.geometry(slot), target = view?.flowMode === 'pdf' || g?.kind === 'pdf' ? view?._iframeWindow?.document?.getElementById('viewerContainer') : view?.iframeDocument;
    const events = [];
    const listener = event => events.push({ trusted: !!event.isTrusted, deltaX: event.deltaX ?? 0, deltaY: event.deltaY ?? 0, defaultPrevented: !!event.defaultPrevented });
    target?.addEventListener?.('wheel', listener, true);
    let error = null;
    try {
      const frame = view?._iframe?.getBoundingClientRect?.() || view?.iframeWindow?.frameElement?.getBoundingClientRect?.();
      const host = reader?._window;
      host?.windowUtils?.sendWheelEvent(Math.round(frame.x + 100), Math.round(frame.y + Math.min(500, frame.height / 2)), 0, 220, 0, 0, 0, 0, 0, 0);
    } catch (e) { error = String(e); }
    target?.removeEventListener?.('wheel', listener, true);
    return { label, error, events };
  };
  h.resume = async (slot, path) => {
    const manager = h.manager(slot), internal = h.internal(slot);
    let error = null;
    try {
      if (path === 'native') internal?.toggleReadAloudPaused(false);
      else manager?.play?.();
    } catch (e) { error = String(e); }
    await h.sleep(360);
    const playing = h.snap(slot, `${path}-playing`);
    let pauseError = null;
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) { pauseError = String(e); }
    await h.sleep(180);
    return { path, error, playing, pauseError, afterPause: h.snap(slot, `${path}-paused`) };
  };
  h.restorePref = (name, saved) => {
    if (!saved?.user) { if (p.prefHasUserValue(name)) p.clearUserPref(name); return; }
    const type = saved.type ?? p.getPrefType(name);
    if (type === p.PREF_BOOL || typeof saved.value === 'boolean') p.setBoolPref(name, !!saved.value);
    else if (type === p.PREF_INT || typeof saved.value === 'number') p.setIntPref(name, Number(saved.value));
    else if (type === p.PREF_STRING || typeof saved.value === 'string') p.setStringPref(name, String(saved.value));
  };
  S.helpers = h;
  return JSON.stringify({
    safeToOpen: pluginVoice,
    memoryVoice: pluginVoice ? memoryVoice : null,
    memoryVoiceChars: state.prepare.memoryVoiceChars,
    during: {
      volume: read('readAloud.volume').value,
      syncPositions: read('webdav.syncPositions').value,
      autoUploadSettings: read('webdav.autoUploadSettings').value,
      syncSettings: read('webdav.syncSettings').value,
      debugStoring: !!Zotero.Debug?.storing,
    },
  });
})()
