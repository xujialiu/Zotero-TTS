return (async () => {
  const slot = Zotero.ZoteroTTSRun.state.fixtures?.pdf;
  const reader = slot?.reader;
  const ir = reader?._internalReader;
  const view = ir?._primaryView;
  let manager = ir?._readAloudManager;
  const rw = view?._iframeWindow;
  if (!reader || !ir || !view || !manager || !rw) throw new Error('PDF reader/manager/view is missing');
  let mw = Components.utils.waiveXrays(manager);
  const vw = Components.utils.waiveXrays(view);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const live = () => {
    manager = ir?._readAloudManager || manager;
    mw = Components.utils.waiveXrays(manager);
    return mw;
  };
  let segments = ir._readAloudSegments?.segments || [];
  // The segment store is lazy for a fresh reader. Open and immediately pause
  // the fixture once to let Zotero materialize its native segments, then close
  // the popup before exercising the closed-player path below.
  if (!segments.length) {
    try { Zotero_Tabs.select(reader.tabID); reader.focus?.(); rw.focus?.(); ir.toggleReadAloudPopup(true); } catch (e) {}
    for (let i = 0; i < 240; i++) {
      segments = ir._readAloudSegments?.segments || mw._segments || [];
      if (segments.length && manager._controller) break;
      await sleep(50);
    }
    if (manager.active && !manager.paused) try { manager.pause(); } catch (e) {}
    try { ir.toggleReadAloudPopup(false); } catch (e) {}
    for (let i = 0; i < 100; i++) {
      if (!ir._state?.readAloudState?.popupOpen && !manager.active) break;
      await sleep(50);
    }
  }
  const spanFor = segment => {
    const spans = ir._readAloudSegments.getSegmentTextSpans(segment) || [];
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      if (span?.node && Number.isInteger(span.start) && Number.isInteger(span.end) && span.end > span.start) return span;
    }
    return null;
  };
  const sameRef = (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  let target = null;
  let targetIndex = -1;
  let sharedBoundary = false;
  let boundary = null;
  // Prefer a non-first segment whose native start is exactly its predecessor's
  // end. This is the boundary that exercised the reported >= lookup defect.
  for (let i = 1; i < segments.length; i++) {
    const span = spanFor(segments[i]);
    const local = span ? String(span.node.text || '').slice(span.start, span.end) : '';
    const shared = sameRef(segments[i - 1]?.position?.end, segments[i]?.position?.start);
    if (span && local.trim().split(/\s+/).length >= 3 && shared) {
      target = { segment: segments[i], span, local };
      targetIndex = i;
      sharedBoundary = true;
      boundary = { previousIndex: i - 1, previousEnd: JSON.parse(JSON.stringify(segments[i - 1].position.end)), targetStart: JSON.parse(JSON.stringify(segments[i].position.start)) };
      break;
    }
  }
  // Keep the fixture usable if its segmentation changes, but expose that the
  // shared-boundary branch was unavailable instead of silently calling it a
  // boundary proof.
  if (!target) for (let i = 1; i < segments.length; i++) {
    const span = spanFor(segments[i]);
    const local = span ? String(span.node.text || '').slice(span.start, span.end) : '';
    if (span && local.trim().split(/\s+/).length >= 3) {
      target = { segment: segments[i], span, local };
      targetIndex = i;
      boundary = { previousIndex: i - 1, previousEnd: JSON.parse(JSON.stringify(segments[i - 1]?.position?.end || [])), targetStart: JSON.parse(JSON.stringify(segments[i]?.position?.start || [])) };
      break;
    }
  }
  if (!target) throw new Error('no usable PDF segment text span');
  const next = targetIndex + 1 < segments.length ? { segment: segments[targetIndex + 1], span: spanFor(segments[targetIndex + 1]) } : null;
  if (!next?.span) throw new Error('no following PDF segment for cross-sentence selection');
  const makeSource = (parts) => {
    const raw = parts.map(part => ({
      ref: JSON.parse(JSON.stringify(part.span.ref)),
      node: JSON.parse(JSON.stringify(part.span.node)),
      start: part.span.start + part.offset,
      end: part.span.start + part.offset + part.length,
    }));
    return ir._sdt.mapper.textNodeSpansToSourcePosition(Components.utils.cloneInto(raw, rw));
  };
  const firstWord = (text => { const m = String(text).match(/^\s*(\S+)/); return m ? { start: m[0].length - m[1].length, text: m[1] } : { start: 0, text: String(text).slice(0, 1) }; })(target.local);
  const secondWord = (() => {
    const m = String(target.local).match(/^\s*\S+\s+(\S+)/);
    if (!m) return { start: 0, text: String(target.local).slice(0, 1) };
    return { start: m.index + m[0].lastIndexOf(m[1]), text: m[1] };
  })();
  const specs = [
    { name: 'opening-word', start: firstWord.start, text: firstWord.text },
    { name: 'first-character', start: firstWord.start, text: firstWord.text.slice(0, 1) },
    { name: 'middle-word', start: secondWord.start, text: secondWord.text },
    { name: 'cross-sentence', cross: true, start: firstWord.start, text: firstWord.text + ' ' + String(next.span.node.text || '').slice(next.span.start, next.span.start + Math.min(12, next.span.end - next.span.start)).trim() },
  ];
  const selectionState = () => {
    let targetPosition = null;
    let hasTarget = null;
    let error = null;
    try { targetPosition = ir.getSelectionPosition?.() ? JSON.parse(JSON.stringify(ir.getSelectionPosition())) : null; } catch (e) { error = String(e); }
    try { hasTarget = !!vw.hasReadAloudTarget; } catch (e) { error ||= String(e); }
    return { hasTarget, position: targetPosition, error };
  };
  const setSelection = spec => {
    const parts = [{ span: target.span, offset: spec.start, length: Math.max(1, spec.text.length) }];
    if (spec.cross) parts.push({ span: next.span, offset: 0, length: Math.min(12, next.span.end - next.span.start) });
    const position = makeSource(parts);
    const range = {
      pageIndex: position.pageIndex,
      anchorOffset: 0,
      headOffset: Math.max(1, spec.text.length),
      collapsed: false,
      anchor: true,
      head: true,
      sortIndex: '00000|00000|00000',
      position: JSON.parse(JSON.stringify(position)),
      text: spec.text,
    };
    vw._setSelectionRanges(Components.utils.cloneInto([range], rw));
    return { position, state: selectionState() };
  };
  const clearSelection = () => {
    try { vw._setSelectionRanges(); } catch (e) {}
    try { rw.getSelection?.()?.removeAllRanges(); } catch (e) {}
  };
  const closePopup = async () => {
    try { ir.toggleReadAloudPopup(false); } catch (e) {}
    for (let i = 0; i < 100; i++) {
      if (!ir._state?.readAloudState?.popupOpen && !manager.active) break;
      await sleep(50);
    }
  };
  const openPaused = async (position = Math.min(targetIndex + 1, segments.length - 1)) => {
    if (!ir._state?.readAloudState?.popupOpen) {
      try { Zotero_Tabs.select(reader.tabID); reader.focus?.(); rw.focus?.(); ir.toggleReadAloudPopup(true); } catch (e) {}
    }
    for (let i = 0; i < 220; i++) {
      if (manager._segments?.length && manager._controller) break;
      await sleep(50);
    }
    if (manager.active && !manager.paused) try { manager.pause(); } catch (e) {}
    if (Number.isInteger(position) && manager._segments?.length && position < manager._segments.length) {
      try { manager.repositionTo(position); } catch (e) {}
      await sleep(180);
      if (manager.active && !manager.paused) try { manager.pause(); } catch (e) {}
    }
    return { active: !!manager.active, paused: !!manager.paused, position: Number.isFinite(mw._controller?._position) ? mw._controller._position : null, popupOpen: !!ir._state?.readAloudState?.popupOpen };
  };
  const press = () => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    // A synthetic PDF selection leaves focus on its inner viewer element;
    // begin the trusted transaction on the host window so Gecko propagates
    // the event through both the host and reader listeners.
    const host = reader._window;
    const K = host.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(host);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32, true)), tip.keyup(ev(' ', 'Space', 32, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  };
  const indexOf = segment => {
    if (!segment) return null;
    let list;
    try { list = live()._segments || segments; } catch (e) { list = segments; }
    let index = list.indexOf(segment);
    if (index >= 0) return index;
    let text = '';
    try { text = String(segment.text || ''); } catch (e) { return null; }
    for (let i = 0; i < (list?.length || 0); i++) if (String(list[i]?.text || '') === text) return i;
    return null;
  };
  const hookStart = () => {
    const options = Components.utils.waiveXrays(manager._options);
    const original = options.onStateChange;
    const events = [];
    const controllers = [];
    const record = () => {
      try {
        const current = live();
        const active = current._activeSegment;
        events.push({ at: Date.now(), active: !!current.active, paused: !!current.paused, position: Number.isFinite(current._controller?._position) ? current._controller._position : null, index: indexOf(active), text: active ? String(active.text || '').slice(0, 100) : null });
      } catch (e) { events.push({ at: Date.now(), error: String(e) }); }
    };
    const wrapper = Components.utils.exportFunction(function () { record(); return original?.apply(this, arguments); }, options);
    options.onStateChange = wrapper;
    const originalCreate = live()._createController;
    const createWrapper = function (...args) {
      let result;
      try { result = Reflect.apply(originalCreate, this, args); }
      finally {
        try {
          const current = Components.utils.waiveXrays(this);
          const active = current._activeSegment;
          controllers.push({ at: Date.now(), backwardStopIndex: Number.isInteger(current._backwardStopIndex) ? current._backwardStopIndex : null, position: Number.isFinite(current._controller?._position) ? current._controller._position : null, index: active ? indexOf(active) : null, active: !!current.active, paused: !!current.paused });
        } catch (e) { controllers.push({ at: Date.now(), error: String(e) }); }
      }
      return result;
    };
    live()._createController = createWrapper;
    return { options, original, events, wrapper, controllers, originalCreate, createWrapper };
  };
  const hookStop = hook => {
    try { hook.options.onStateChange = hook.original; } catch (e) {}
    try { live()._createController = hook.originalCreate; } catch (e) {}
  };
  const waitFirst = async (hook, max = 120, expected = null, eventStart = 0, controllerStart = 0) => {
    for (let i = 0; i < max; i++) {
      for (let j = eventStart; j < hook.events.length; j++) {
        const event = hook.events[j];
        if ((expected !== null && event.index === expected) || (expected === null && Number.isInteger(event.index) && event.index >= 0)) return { active: event, controller: null, newControllers: hook.controllers.slice(controllerStart) };
      }
      for (let j = controllerStart; j < hook.controllers.length; j++) {
        const controller = hook.controllers[j];
        if (expected !== null && (controller.backwardStopIndex === expected || controller.position === expected)) {
          try {
            const current = live();
            const active = current._activeSegment;
            if (active && indexOf(active) === expected) return { active: { at: Date.now(), active: !!current.active, paused: !!current.paused, position: Number.isFinite(current._controller?._position) ? current._controller._position : null, index: expected, text: String(active.text || '').slice(0, 100), polled: true }, controller, newControllers: hook.controllers.slice(controllerStart) };
          } catch (e) {}
        }
      }
      try {
        const current = live();
        const active = current._activeSegment;
        const position = Number.isFinite(current._controller?._position) ? current._controller._position : null;
        const index = active ? indexOf(active) : null;
        if (current.active && active && (expected === null || index === expected)) return { active: { at: Date.now(), active: true, paused: !!current.paused, position, index, text: String(active.text || '').slice(0, 100), polled: true }, controller: null, newControllers: hook.controllers.slice(controllerStart) };
      } catch (e) {}
      await sleep(50);
    }
    let controller = null;
    for (let j = controllerStart; j < hook.controllers.length; j++) {
      const candidate = hook.controllers[j];
      if (expected !== null && (candidate.backwardStopIndex === expected || candidate.position === expected)) { controller = candidate; break; }
    }
    return { active: null, controller, newControllers: hook.controllers.slice(controllerStart) };
  };
  const runClosed = async spec => {
    await closePopup();
    clearSelection();
    const selected = setSelection(spec);
    const smart = (() => { try { return JSON.parse(Zotero.ZoteroTTS.diagnostics.smartKey()); } catch (e) { return { error: String(e) }; } })();
    const hook = hookStart();
    const eventStart = hook.events.length;
    const controllerStart = hook.controllers.length;
    let keys = null;
    let error = null;
    try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); rw.focus?.(); keys = press(); } catch (e) { error = String(e); }
    const evidence = await waitFirst(hook, 120, targetIndex, eventStart, controllerStart);
    if (manager.active && !manager.paused) try { manager.pause(); } catch (e) {}
    await sleep(120);
    hookStop(hook);
    const newControllers = evidence.newControllers || hook.controllers.slice(controllerStart);
    const firstTargetController = newControllers.find(controller => controller.backwardStopIndex === targetIndex || controller.position === targetIndex) || null;
    const firstNewController = newControllers[0] || null;
    const wrongBeforeTarget = firstTargetController ? newControllers.slice(0, newControllers.indexOf(firstTargetController)).filter(controller => controller.backwardStopIndex !== targetIndex && controller.position !== targetIndex) : newControllers;
    const observed = { firstActive: evidence.active, firstNewController, targetController: firstTargetController, newControllers, wrongBeforeTarget, events: hook.events.length, eventHead: hook.events.slice(0, 3), eventTail: hook.events.slice(-2) };
    const result = { mode: 'closed', name: spec.name, expectedIndex: targetIndex, expectedText: String(target.segment.text || '').slice(0, 120), selected: { text: spec.text, position: selected.position, state: selected.state }, smart: smart.readers?.find(x => x.itemID === reader.itemID) || null, keys, error, observed, pass: !!selected.state?.hasTarget && keys?.[1] === 1 && !!firstTargetController && !wrongBeforeTarget.length };
    await closePopup();
    clearSelection();
    return result;
  };
  const runPaused = async spec => {
    await openPaused();
    clearSelection();
    const selected = setSelection(spec);
    const before = { position: Number.isFinite(mw._controller?._position) ? mw._controller._position : null, active: !!manager.active, paused: !!manager.paused, hasTarget: !!vw.hasReadAloudTarget, selection: selected.state };
    const hook = hookStart();
    const eventStart = hook.events.length;
    const controllerStart = hook.controllers.length;
    let keys = null;
    let error = null;
    try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); rw.focus?.(); keys = press(); } catch (e) { error = String(e); }
    const evidence = await waitFirst(hook, 120, targetIndex, eventStart, controllerStart);
    if (manager.active && !manager.paused) try { manager.pause(); } catch (e) {}
    await sleep(120);
    hookStop(hook);
    const newControllers = evidence.newControllers || hook.controllers.slice(controllerStart);
    const firstTargetController = newControllers.find(controller => controller.backwardStopIndex === targetIndex || controller.position === targetIndex) || null;
    const firstNewController = newControllers[0] || null;
    const wrongBeforeTarget = firstTargetController ? newControllers.slice(0, newControllers.indexOf(firstTargetController)).filter(controller => controller.backwardStopIndex !== targetIndex && controller.position !== targetIndex) : newControllers;
    const after = { position: Number.isFinite(mw._controller?._position) ? mw._controller._position : null, active: !!manager.active, paused: !!manager.paused, hasTarget: !!vw.hasReadAloudTarget };
    const result = { mode: 'paused', name: spec.name, expectedIndex: targetIndex, selected: { text: spec.text, position: selected.position, state: selected.state }, before, keys, error, observed: { firstActive: evidence.active, firstNewController, targetController: firstTargetController, newControllers, wrongBeforeTarget, events: hook.events.length, eventHead: hook.events.slice(0, 3), eventTail: hook.events.slice(-2) }, after, pass: !!selected.state?.hasTarget && keys?.[1] === 1 && !!firstTargetController && !wrongBeforeTarget.length && after.paused };
    await closePopup();
    clearSelection();
    return result;
  };
  const results = [];
  for (const spec of specs) {
    results.push(await runClosed(spec));
    results.push(await runPaused(spec));
  }
  // With no selection, the same paused controller resumes in place. This
  // distinguishes the explicit selection restart from the ordinary resume
  // branch of Shift+Space.
  await openPaused(targetIndex);
  clearSelection();
  const noSelectionBefore = { position: Number.isFinite(mw._controller?._position) ? mw._controller._position : null, active: !!manager.active, paused: !!manager.paused, selection: selectionState() };
  let noSelectionKeys = null;
  let noSelectionError = null;
  try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); rw.focus?.(); noSelectionKeys = press(); } catch (e) { noSelectionError = String(e); }
  await sleep(140);
  const noSelectionAfter = { position: Number.isFinite(mw._controller?._position) ? mw._controller._position : null, active: !!manager.active, paused: !!manager.paused, selection: selectionState() };
  if (manager.active && !manager.paused) try { manager.pause(); } catch (e) {}
  const noSelectionResume = { before: noSelectionBefore, keys: noSelectionKeys, error: noSelectionError, after: noSelectionAfter, pass: noSelectionBefore.position === noSelectionAfter.position && noSelectionAfter.active && noSelectionAfter.selection.hasTarget === false };
  await closePopup();
  // A playing session with a selection must be paused in place by Shift+Space.
  await openPaused(targetIndex);
  clearSelection();
  const playingSelection = setSelection(specs[1]);
  try { manager.play(); } catch (e) {}
  for (let i = 0; i < 80 && manager.paused; i++) await sleep(50);
  const playingBefore = { position: Number.isFinite(mw._controller?._position) ? mw._controller._position : null, active: !!manager.active, paused: !!manager.paused, hasTarget: !!vw.hasReadAloudTarget, selection: playingSelection.state };
  let playingKeys = null;
  let playingError = null;
  try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); rw.focus?.(); playingKeys = press(); } catch (e) { playingError = String(e); }
  await sleep(250);
  const playingAfter = { position: Number.isFinite(mw._controller?._position) ? mw._controller._position : null, active: !!manager.active, paused: !!manager.paused, hasTarget: !!vw.hasReadAloudTarget };
  if (manager.active && !manager.paused) try { manager.pause(); } catch (e) {}
  clearSelection();
  await closePopup();
  let closeError = null;
  try { reader.close?.(); } catch (e) { closeError = String(e); }
  for (let i = 0; i < 120; i++) {
    let present = false;
    for (const open of Zotero.Reader._readers || []) if (open?.itemID === slot.itemID) { present = true; break; }
    if (!present) break;
    await sleep(50);
  }
  let left = 0;
  for (const open of Zotero.Reader._readers || []) if (open?.itemID === slot.itemID) left++;
  slot.reader = null;
  slot.pdfResults = { targetIndex, sharedBoundary, boundary, targetText: String(target.segment.text || ''), results, noSelectionResume, playingPause: { before: playingBefore, keys: playingKeys, error: playingError, after: playingAfter, pass: playingBefore.position === playingAfter.position && playingAfter.paused } };
  return JSON.stringify({ targetIndex, sharedBoundary, boundary, targetText: String(target.segment.text || '').slice(0, 180), count: results.length, passCount: results.filter(x => x.pass).length, closed: results.filter(x => x.mode === 'closed' && x.pass).length, paused: results.filter(x => x.mode === 'paused' && x.pass).length, noSelectionResume, playingPause: slot.pdfResults.playingPause, closeError, left, details: results });
})()
