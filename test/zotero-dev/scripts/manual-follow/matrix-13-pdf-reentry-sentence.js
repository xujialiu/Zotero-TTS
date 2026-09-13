return (async () => {
  const root = Zotero.__ztts100;
  const slot = root && root.pdf;
  const reader = slot && slot.reader;
  const internal = reader && reader._internalReader;
  const manager = internal && internal._readAloudManager;
  const view = internal && internal._primaryView;
  const rw = view && view._iframeWindow;
  const host = reader && reader._window;
  const container = rw && rw.document && rw.document.getElementById('viewerContainer');
  const pref = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const original = { value: Services.prefs.getStringPref(pref, 'sentence'), user: Services.prefs.prefHasUserValue(pref) };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  if (!reader || !manager || !view || !rw || !host || !container) throw new Error('PDF reentry state missing');
  const index = () => (Zotero.Reader._readers || []).indexOf(reader);
  const diag = () => {
    const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll());
    return all[index()] || null;
  };
  const activePosition = () => {
    const state = Components.utils.waiveXrays(view._readAloudState);
    let active = Components.utils.waiveXrays(state && state.activeSegment);
    if (!active) active = Components.utils.waiveXrays(manager._activeSegment);
    const source = active && active.sourcePosition;
    return source ? JSON.parse(JSON.stringify(source)) : null;
  };
  const rects = () => {
    const position = activePosition();
    const pages = (rw.PDFViewerApplication && rw.PDFViewerApplication.pdfViewer && rw.PDFViewerApplication.pdfViewer._pages) || [];
    const output = [];
    if (!position) return output;
    const groups = [
      { name: 'head', page: position.pageIndex, list: position.rects },
      { name: 'nextPage', page: Number(position.pageIndex) + 1, list: position.nextPageRects },
    ];
    const containerRect = container.getBoundingClientRect();
    for (const group of groups) {
      const page = Number.isInteger(group.page) ? pages[group.page] : null;
      if (!page || !group.list || !group.list.length) continue;
      const pageRect = page.div.getBoundingClientRect();
      for (let i = 0; i < group.list.length; i++) {
        const q = group.list[i];
        const a = page.viewport.convertToViewportPoint(q[0], q[1]);
        const b = page.viewport.convertToViewportPoint(q[2], q[3]);
        const screen = [
          pageRect.x + Math.min(a[0], b[0]),
          pageRect.y + Math.min(a[1], b[1]),
          pageRect.x + Math.max(a[0], b[0]),
          pageRect.y + Math.max(a[1], b[1]),
        ];
        output.push({
          group: group.name,
          page: group.page,
          rect: i,
          screen,
          visible: screen[2] > containerRect.left && screen[3] > containerRect.top && screen[0] < containerRect.right && screen[1] < containerRect.bottom,
        });
      }
    }
    return output;
  };
  const snapshot = label => {
    const d = diag();
    const rs = rects();
    const controller = manager._controller;
    return {
      label,
      at: Date.now(),
      position: controller && Number.isFinite(controller._position) ? controller._position : null,
      active: !!manager.active,
      paused: !!manager.paused,
      scrollTop: container.scrollTop,
      viewport: {
        left: container.getBoundingClientRect().left,
        top: container.getBoundingClientRect().top,
        right: container.getBoundingClientRect().right,
        bottom: container.getBoundingClientRect().bottom,
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight,
      },
      rects: rs,
      visibleFragments: rs.filter(x => x.visible).length,
      activeText: manager._activeSegment && manager._activeSegment.text ? String(manager._activeSegment.text).slice(0, 90) : null,
      following: d && d.following !== undefined ? d.following : null,
      visibilityPaused: d && d.visibilityPaused !== undefined ? d.visibilityPaused : null,
      interacting: d && d.interacting !== undefined ? d.interacting : null,
      pending: d && d.pending !== undefined ? d.pending : null,
      reason: d && d.reason !== undefined ? d.reason : null,
      last: d && d.last !== undefined ? d.last : null,
    };
  };
  const setup = async () => {
    Zotero_Tabs.select(reader.tabID);
    if (reader.focus) reader.focus();
    if (rw.focus) rw.focus();
    try { manager.repositionTo(0); } catch (e) {}
    await sleep(350);
    try { manager._stateChanged(); } catch (e) {}
    await sleep(120);
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {}
    await sleep(120);
    container.scrollTo(0, 0);
    try { manager._stateChanged(); } catch (e) {}
    await sleep(180);
    return snapshot('setup');
  };
  const wheelMove = async (target, label) => {
    const events = [];
    const listener = event => events.push({ trusted: !!event.isTrusted, deltaX: event.deltaX, deltaY: event.deltaY, target: String(event.target && event.target.localName || ''), defaultPrevented: !!event.defaultPrevented });
    container.addEventListener('wheel', listener, true);
    const before = snapshot(label + '-before');
    let wheelError = null;
    try {
      const frame = rw.frameElement.getBoundingClientRect();
      host.windowUtils.sendWheelEvent(Math.round(frame.x + 100), Math.round(frame.y + Math.min(500, frame.height / 2)), 0, 220, 0, 0, 0, 0, 0, 0);
    } catch (e) { wheelError = String(e); }
    const afterWheel = snapshot(label + '-after-trusted-wheel');
    container.scrollTo(0, target);
    const afterMove = snapshot(label + '-after-controlled-move');
    await sleep(80);
    const held = snapshot(label + '-80ms');
    await sleep(280);
    const settled = snapshot(label + '-360ms');
    container.removeEventListener('wheel', listener, true);
    return { label, targetScrollTop: target, wheelError, events, before, afterWheel, afterMove, held, settled, actualDelta: afterMove.scrollTop - before.scrollTop };
  };
  const statePushes = async label => {
    const output = [];
    for (let i = 0; i < 3; i++) {
      let error = null;
      try { manager._stateChanged(); } catch (e) { error = String(e); }
      await sleep(140);
      output.push({ error, snapshot: snapshot(label + '-' + (i + 1)) });
    }
    return output;
  };
  let output = null;
  try {
    Services.prefs.setStringPref(pref, 'sentence');
    const setupState = await setup();
    const partial1 = await wheelMove(200, 'partial1');
    const outside1 = await wheelMove(800, 'outside1');
    const outsidePushes1 = await statePushes('outside1-state-push');
    await sleep(500);
    const outsideAfter500 = snapshot('outside1-after-500ms');
    const reentry1 = await wheelMove(200, 'reentry1');
    const outside2 = await wheelMove(800, 'outside2');
    const outsidePushes2 = await statePushes('outside2-state-push');
    await sleep(500);
    const outsideAfter500b = snapshot('outside2-after-500ms');
    const reentry2 = await wheelMove(200, 'reentry2');
    output = { mode: 'sentence', setup: setupState, partial1, outside1, outsidePushes1, outsideAfter500, reentry1, outside2, outsidePushes2, outsideAfter500b, reentry2 };
  } finally {
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {}
    try { container.scrollTo(0, 0); } catch (e) {}
    if (original.user) Services.prefs.setStringPref(pref, original.value);
    else if (Services.prefs.prefHasUserValue(pref)) Services.prefs.clearUserPref(pref);
    await sleep(180);
  }
  return JSON.stringify({ output, restoredMode: { value: Services.prefs.getStringPref(pref, '<none>'), user: Services.prefs.prefHasUserValue(pref) }, final: snapshot('final') });
})()
