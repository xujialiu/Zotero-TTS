return (async () => {
  const root = Zotero.__ztts100, slot = root && root.epub, reader = slot && slot.reader;
  const internal = reader && reader._internalReader, manager = internal && internal._readAloudManager;
  const view = internal && internal._primaryView, helper = view && Components.utils.waiveXrays(view._readAloud);
  const win = view && view.iframeWindow, doc = view && view.iframeDocument;
  const pref = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const original = { value: Services.prefs.getStringPref(pref, 'sentence'), user: Services.prefs.prefHasUserValue(pref) };
  const defaultBranch = Services.prefs.getDefaultBranch(''), defaultValue = defaultBranch.getStringPref(pref, 'sentence');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  if (!reader || !internal || !manager || !view || !helper || !win || !doc) throw new Error('scrolled EPUB reentry state missing');
  const index = () => (Zotero.Reader._readers || []).indexOf(reader);
  const diag = () => { const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll()); return all[index()] || null; };
  const activeState = () => Components.utils.waiveXrays(helper.state);
  const boxes = () => {
    const state = activeState(), selector = helper._resolveSegmentSelector(state), range = selector ? view.toDisplayedRange(selector) : null;
    const list = range && range.getClientRects ? range.getClientRects() : null, width = doc.documentElement.clientWidth || win.innerWidth, height = doc.documentElement.clientHeight || win.innerHeight, out = [];
    for (let i = 0; list && i < list.length; i++) {
      const b = list[i];
      out.push({ i, screen: [b.left, b.top, b.right, b.bottom], document: [b.left + win.scrollX, b.top + win.scrollY, b.right + win.scrollX, b.bottom + win.scrollY], visible: b.right > 0 && b.bottom > 0 && b.left < width && b.top < height });
    }
    return { selector: selector ? JSON.stringify(selector).slice(0, 220) : null, boxes: out, width, height };
  };
  const snapshot = label => {
    const d = diag(), geo = boxes();
    return { label, at: Date.now(), position: manager._controller && manager._controller._position !== undefined ? manager._controller._position : null, active: !!manager.active, paused: !!manager.paused, scrollY: win.scrollY, geometry: geo, activeText: manager._activeSegment && manager._activeSegment.text ? String(manager._activeSegment.text).slice(0, 90) : null, visibleFragments: geo.boxes.filter(x => x.visible).length, following: d && d.following !== undefined ? d.following : null, visibilityPaused: d && d.visibilityPaused !== undefined ? d.visibilityPaused : null, interacting: d && d.interacting !== undefined ? d.interacting : null, pending: d && d.pending !== undefined ? d.pending : null, mode: d && d.mode !== undefined ? d.mode : null, flow: d && d.flow !== undefined ? d.flow : view.flowMode, reason: d && d.reason !== undefined ? d.reason : null, last: d && d.last !== undefined ? d.last : null };
  };
  const setup = async () => {
    Zotero_Tabs.select(reader.tabID); if (reader.focus) reader.focus(); if (win.focus) win.focus();
    try { manager.repositionTo(0); } catch (e) {}
    await sleep(350); try { manager._stateChanged(); } catch (e) {}
    await sleep(120); try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {}
    await sleep(120); win.scrollTo(0, 0); try { manager._stateChanged(); } catch (e) {}
    await sleep(180); return snapshot('setup');
  };
  const wheelMove = async (target, label) => {
    const events = [], listener = event => events.push({ trusted: !!event.isTrusted, deltaY: event.deltaY, target: String(event.target && event.target.localName || ''), defaultPrevented: !!event.defaultPrevented });
    doc.addEventListener('wheel', listener, true); const before = snapshot(label + '-before'); let error = null;
    try { const frame = win.frameElement.getBoundingClientRect(); reader._window.windowUtils.sendWheelEvent(Math.round(frame.x + 100), Math.round(frame.y + Math.min(500, frame.height / 2)), 0, 220, 0, 0, 0, 0, 0, 0); } catch (e) { error = String(e); }
    const afterWheel = snapshot(label + '-after-trusted-wheel'); win.scrollTo(0, target); const afterMove = snapshot(label + '-after-controlled-move'); await sleep(80); const held = snapshot(label + '-80ms'); await sleep(280); const settled = snapshot(label + '-360ms'); doc.removeEventListener('wheel', listener, true);
    return { label, targetScrollY: target, error, events, before, afterWheel, afterMove, held, settled, actualDelta: afterMove.scrollY - before.scrollY };
  };
  const statePushes = async label => { const out = []; for (let i = 0; i < 3; i++) { let error = null; try { manager._stateChanged(); } catch (e) { error = String(e); } await sleep(140); out.push({ error, snapshot: snapshot(label + '-' + (i + 1)) }); } return out; };
  const restoreMode = () => {
    if (!original.user) { if (Services.prefs.prefHasUserValue(pref)) Services.prefs.clearUserPref(pref); return; }
    if (original.value === defaultValue) { const alternate = original.value === 'sentence' ? 'outside' : 'sentence'; defaultBranch.setStringPref(pref, alternate); Services.prefs.setStringPref(pref, original.value); defaultBranch.setStringPref(pref, defaultValue); }
    else Services.prefs.setStringPref(pref, original.value);
  };
  let output = null;
  try {
    Services.prefs.setStringPref(pref, 'sentence');
    const setupState = await setup(); const partial = await wheelMove(50, 'partial'); const outside = await wheelMove(800, 'outside'); const pushes = await statePushes('outside-state-push'); await sleep(500); const outsideAfter500 = snapshot('outside-after-500ms'); const reentry = await wheelMove(50, 'reentry'); const outsideRepeat = await wheelMove(800, 'outside-repeat'); const reentryRepeat = await wheelMove(50, 'reentry-repeat'); output = { mode: 'sentence', flow: view.flowMode, setup: setupState, partial, outside, pushes, outsideAfter500, reentry, outsideRepeat, reentryRepeat };
  } finally {
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {}
    try { win.scrollTo(0, 0); } catch (e) {}
    restoreMode(); await sleep(180);
  }
  return JSON.stringify({ output, restoredMode: { value: Services.prefs.getStringPref(pref, '<none>'), user: Services.prefs.prefHasUserValue(pref) }, final: snapshot('final') });
})()
