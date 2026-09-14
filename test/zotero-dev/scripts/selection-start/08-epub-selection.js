return (async () => {
  const slot = Zotero.ZoteroTTSRun.state.fixtures?.epub;
  const reader = slot?.reader;
  const ir = reader?._internalReader;
  const view = ir?._primaryView;
  const manager = ir?._readAloudManager;
  const rw = view?._iframeWindow;
  const doc = view?._iframeDocument;
  if (!reader || !ir || !view || !manager || !rw || !doc) throw new Error('EPUB reader/manager/view is missing');
  const mw = Components.utils.waiveXrays(manager);
  const vw = Components.utils.waiveXrays(view);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let segments = ir._readAloudSegments?.segments || [];
  // EPUB segment computation is lazy on a fresh tab. Materialize the native
  // list once with a muted popup, then close it before the idle selection pass.
  if (!segments.length) {
    try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); rw.focus?.(); ir.toggleReadAloudPopup(true); } catch (e) {}
    for (let i = 0; i < 240; i++) {
      segments = ir._readAloudSegments?.segments || Components.utils.waiveXrays(manager)._segments || [];
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
  const usable = [];
  for (let i = 0; i < segments.length; i++) {
    const text = String(segments[i]?.text || '').trim();
    if (text.split(/\s+/).length >= 3 && (segments[i].sourcePosition || segments[i].position)) usable.push({ index: i, segment: segments[i], text });
  }
  if (!usable.length) throw new Error('no usable EPUB segment');
  const target = usable[0];
  const next = usable.find(x => x.index > target.index) || null;
  const displayedRange = segment => {
    const position = segment.sourcePosition || segment.position;
    return position ? view.toDisplayedRange(position) : null;
  };
  const nodesInRange = range => {
    const root = range.commonAncestorContainer.nodeType === rw.Node.TEXT_NODE ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
    const walker = doc.createTreeWalker(root, rw.NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      try { if (range.intersectsNode(node)) nodes.push(node); } catch (e) {}
    }
    return nodes;
  };
  const pointAt = (range, offset) => {
    const nodes = nodesInRange(range);
    let remaining = Math.max(0, offset);
    for (const node of nodes) {
      const lo = node === range.startContainer ? range.startOffset : 0;
      const hi = node === range.endContainer ? range.endOffset : String(node.nodeValue || '').length;
      const available = Math.max(0, hi - lo);
      if (remaining <= available) return [node, lo + remaining];
      remaining -= available;
    }
    return [range.endContainer, range.endOffset];
  };
  const makeSelection = spec => {
    const base = displayedRange(target.segment);
    if (!base) throw new Error('target source position did not resolve to a DOM range');
    const full = String(base.toString());
    const start = Math.max(0, Math.min(spec.start, full.length - 1));
    const end = spec.cross && next ? full.length : Math.min(full.length, start + Math.max(1, spec.text.length));
    const selectionRange = doc.createRange();
    const p1 = pointAt(base, start);
    if (spec.cross && next) {
      const following = displayedRange(next.segment);
      if (!following) throw new Error('following source position did not resolve to a DOM range');
      selectionRange.setStart(p1[0], p1[1]);
      selectionRange.setEnd(following.endContainer, following.endOffset);
    } else {
      const p2 = pointAt(base, end);
      selectionRange.setStart(p1[0], p1[1]);
      selectionRange.setEnd(p2[0], p2[1]);
    }
    const selection = rw.getSelection();
    selection.removeAllRanges();
    selection.addRange(selectionRange);
    try { doc.dispatchEvent(new rw.Event('selectionchange', { bubbles: true })); } catch (e) {}
    try { vw._openSelectionPopup(selection); } catch (e) { throw new Error('opening selection popup failed: ' + String(e)); }
    return { text: String(selection.toString()), position: (() => { try { return JSON.parse(JSON.stringify(ir.getSelectionPosition?.())); } catch (e) { return null; } })(), hasTarget: !!vw.hasReadAloudTarget };
  };
  const clearSelection = () => {
    try { rw.getSelection()?.removeAllRanges(); } catch (e) {}
    try { vw.setSelectionPopup(null); } catch (e) {}
  };
  const closePopup = async () => {
    try { ir.toggleReadAloudPopup(false); } catch (e) {}
    for (let i = 0; i < 100; i++) {
      if (!ir._state?.readAloudState?.popupOpen && !manager.active) break;
      await sleep(50);
    }
  };
  const firstWord = (String(target.text).match(/^(\S+)/) || ['', String(target.text).slice(0, 1)])[1];
  const middle = (String(target.text).match(/^\S+\s+(\S+)/) || ['', String(target.text).slice(0, 1)])[1];
  const specs = [
    { name: 'first-character', start: 0, text: firstWord.slice(0, 1) },
    { name: 'middle-word', start: String(target.text).indexOf(middle), text: middle },
    { name: 'cross-sentence', start: 0, text: firstWord + (next ? ' ' + String(next.text).slice(0, 12) : ''), cross: !!next },
  ];
  const press = () => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const host = reader._window;
    const K = host.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(host);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32, true)), tip.keyup(ev(' ', 'Space', 32, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  };
  const indexOf = segment => {
    const list = mw._segments || segments;
    for (let i = 0; i < (list?.length || 0); i++) {
      if (list[i] === segment || String(list[i]?.text || '') === String(segment?.text || '')) return i;
    }
    return null;
  };
  const hookStart = () => {
    const options = Components.utils.waiveXrays(manager._options);
    const original = options.onStateChange;
    const events = [];
    const record = () => {
      try {
        const active = mw._activeSegment;
        events.push({ at: Date.now(), active: !!mw.active, paused: !!mw.paused, position: Number.isFinite(mw._controller?._position) ? mw._controller._position : null, index: indexOf(active), text: active ? String(active.text || '').slice(0, 100) : null });
      } catch (e) { events.push({ at: Date.now(), error: String(e) }); }
    };
    const wrapper = Components.utils.exportFunction(function () { record(); return original?.apply(this, arguments); }, options);
    options.onStateChange = wrapper;
    return { options, original, events };
  };
  const hookStop = hook => { try { hook.options.onStateChange = hook.original; } catch (e) {} };
  const waitFirst = async (hook, since = 0, expected = null, eventStart = 0) => {
    for (let i = 0; i < 280; i++) {
      for (let j = eventStart; j < hook.events.length; j++) {
        const event = hook.events[j];
        if (event.at >= since && ((expected !== null && event.index === expected) || (expected === null && Number.isInteger(event.index) && event.index >= 0))) return event;
      }
      try {
        const active = mw._activeSegment;
        const position = Number.isFinite(mw._controller?._position) ? mw._controller._position : null;
        const index = active ? indexOf(active) : null;
        if (mw.active && active && (expected === null || index === expected)) return { at: Date.now(), active: true, paused: !!mw.paused, position, index, text: String(active.text || '').slice(0, 100), polled: true };
        if (mw.active && expected !== null && position === expected) return { at: Date.now(), active: true, paused: !!mw.paused, position, index: expected, text: active ? String(active.text || '').slice(0, 100) : null, polled: true, controllerTarget: true };
      } catch (e) {}
      await sleep(50);
    }
    return null;
  };
  const openPaused = async (position = Math.min(target.index + 1, segments.length - 1)) => {
    if (!ir._state?.readAloudState?.popupOpen) {
      try { Zotero_Tabs.select(reader.tabID); reader.focus?.(); rw.focus?.(); ir.toggleReadAloudPopup(true); } catch (e) {}
    }
    for (let i = 0; i < 220; i++) {
      if (manager._segments?.length && manager._controller) break;
      await sleep(50);
    }
    if (manager.active && !manager.paused) try { manager.pause(); } catch (e) {}
    if (manager._segments?.length && position < manager._segments.length) {
      try { manager.repositionTo(position); } catch (e) {}
      await sleep(180);
      if (manager.active && !manager.paused) try { manager.pause(); } catch (e) {}
    }
    return { active: !!manager.active, paused: !!manager.paused, position: Number.isFinite(mw._controller?._position) ? mw._controller._position : null };
  };
  const run = async spec => {
    await closePopup();
    clearSelection();
    let selected;
    let selectError = null;
    try { selected = makeSelection(spec); } catch (e) { selectError = String(e); }
    const hook = hookStart();
    const eventStart = hook.events.length;
    let keys = null;
    let error = null;
    const triggerAt = Date.now();
    try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); rw.focus?.(); keys = press(); } catch (e) { error = String(e); }
    const first = await waitFirst(hook, triggerAt, target.index, eventStart);
    if (manager.active && !manager.paused) try { manager.pause(); } catch (e) {}
    await sleep(100);
    hookStop(hook);
    const result = { name: spec.name, expectedIndex: target.index, selected, selectError, keys, error, observed: { first, events: hook.events.length, eventHead: hook.events.slice(0, 3), eventTail: hook.events.slice(-2) }, pass: !!selected?.hasTarget && first?.index === target.index };
    await closePopup();
    clearSelection();
    return result;
  };
  const results = [];
  for (const spec of specs) results.push(await run(spec));
  await openPaused();
  clearSelection();
  let pausedSelected = null;
  try { pausedSelected = makeSelection(specs[0]); } catch (e) {}
  const pausedBefore = { position: Number.isFinite(mw._controller?._position) ? mw._controller._position : null, active: !!manager.active, paused: !!manager.paused, hasTarget: !!vw.hasReadAloudTarget, selected: pausedSelected };
  let pausedKeys = null;
  let pausedError = null;
  const pausedHook = hookStart();
  const pausedEventStart = pausedHook.events.length;
  const pausedTriggerAt = Date.now();
  try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); rw.focus?.(); pausedKeys = press(); } catch (e) { pausedError = String(e); }
  const pausedFirst = await waitFirst(pausedHook, pausedTriggerAt, target.index, pausedEventStart);
  if (manager.active && !manager.paused) try { manager.pause(); } catch (e) {}
  await sleep(100);
  hookStop(pausedHook);
  const pausedAfter = { position: Number.isFinite(mw._controller?._position) ? mw._controller._position : null, active: !!manager.active, paused: !!manager.paused, hasTarget: !!vw.hasReadAloudTarget };
  const pausedResult = { before: pausedBefore, keys: pausedKeys, error: pausedError, observed: { first: pausedFirst, events: pausedHook.events.length, eventHead: pausedHook.events.slice(0, 3), eventTail: pausedHook.events.slice(-2) }, after: pausedAfter, pass: pausedFirst?.index === target.index && pausedAfter.paused };
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
  slot.epubResults = { targetIndex: target.index, targetText: target.text, results, paused: pausedResult, closeError, left };
  return JSON.stringify({ targetIndex: target.index, count: results.length, passCount: results.filter(x => x.pass).length, paused: pausedResult, closeError, left, details: results });
})()
