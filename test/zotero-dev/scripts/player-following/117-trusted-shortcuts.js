return (async () => {
  const state = Zotero.ZoteroTTSRun.state, h = state.helpers;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 7000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { let value = null; try { value = await test(); } catch (e) {} if (value) return value; await sleep(100); }
    return test();
  };
  const readerOf = id => { for (const reader of Zotero.Reader?._readers || []) if (reader?.itemID === id) return reader; return null; };
  const frameOf = reader => reader?._iframeWindow?.document?.getElementById('ztts-player-frame');
  const managerOf = reader => reader?._internalReader?._readAloudManager;
  const ui = reader => {
    const frame = frameOf(reader), mode = frame?.contentDocument?.querySelector('.mode');
    return { layout: frame?.getAttribute('data-layout') || null, text: mode?.textContent?.trim() || null, title: mode?.title || null, label: mode?.getAttribute('aria-label') || null, pressed: mode?.getAttribute('aria-pressed') || null };
  };
  const snap = (slot, label) => {
    const reader = readerOf(slot?.itemID), manager = managerOf(reader), c = manager?._controller, d = h.diag(slot) || {};
    return { label, itemID: slot?.itemID ?? null, tabID: reader?.tabID ?? null, position: c?._position ?? null, active: !!manager?.active, paused: !!manager?.paused, following: d.following ?? null, sentenceProtected: d.sentenceProtected ?? null, visibilityPaused: d.visibilityPaused ?? null, reason: d.reason ?? null, last: d.last ? { at: d.last.at, reason: d.last.reason, issued: d.last.issued, from: d.last.from } : null, ui: ui(reader) };
  };
  const ensureMode = async (slot, expected) => {
    const reader = readerOf(slot?.itemID), current = h.diag(slot);
    if (!!current?.following !== expected || current?.sentenceProtected || current?.visibilityPaused) frameOf(reader)?.contentDocument?.querySelector('.mode')?.click();
    await waitFor(() => {
      const d = h.diag(slot), mode = ui(reader);
      return !!d && !!d.following === expected && mode.pressed === String(expected);
    });
    await sleep(250);
    return snap(slot, expected ? 'automatic' : 'manual');
  };
  const trusted = async (reader, action) => {
    const keys = { previousSentence: ['ArrowLeft', 'ArrowLeft', 37, false], nextSentence: ['ArrowRight', 'ArrowRight', 39, false], previousParagraph: ['ArrowLeft', 'ArrowLeft', 37, true], nextParagraph: ['ArrowRight', 'ArrowRight', 39, true], returnToSpoken: ['Enter', 'Enter', 13, true] };
    const [key, code, keyCode, shift] = keys[action];
    let result = null, error = null;
    try {
      reader.focus?.(); reader._iframeWindow?.focus?.();
      const rw = reader._iframeWindow;
      const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
      const event = (name, pressed) => new rw.KeyboardEvent('', { key: name, code: name === 'Shift' ? 'ShiftLeft' : name === 'Enter' ? 'Enter' : code, keyCode: name === 'Shift' ? 16 : name === 'Enter' ? 13 : keyCode, bubbles: true, cancelable: true, shiftKey: pressed });
      tip.beginInputTransactionForTests(rw);
      if (shift) result = { shiftDown: tip.keydown(event('Shift', true)), keyDown: tip.keydown(event(key, true)), keyUp: tip.keyup(event(key, true)), shiftUp: tip.keyup(event('Shift', false)) };
      else result = { keyDown: tip.keydown(event(key, false)), keyUp: tip.keyup(event(key, false)) };
      if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    } catch (e) { error = String(e); }
    return { action, result, error };
  };
  if (!h) return JSON.stringify({ error: 'helpers missing' });
  const rows = [];
  for (const kind of ['pdf', 'epubScrolled', 'epubPaginated']) {
    const slot = state.fixtures?.[kind], reader = readerOf(slot?.itemID), manager = managerOf(reader);
    const row = { kind, itemID: slot?.itemID ?? null, tabID: reader?.tabID ?? null, error: null, actions: [] };
    if (!slot || !reader || !manager) { row.error = 'fixture reader or manager missing'; rows.push(row); continue; }
    try {
      // The chrome listener falls back to the selected tab. Select the
      // disposable fixture before each key so the trusted event and its
      // reader-local listener have the same target.
      h.select(slot);
      const start = kind === 'pdf' ? 6 : kind === 'epubPaginated' ? 50 : 30;
      await h.pause(slot);
      for (const action of ['returnToSpoken', 'previousSentence', 'nextSentence', 'previousParagraph', 'nextParagraph']) {
        h.select(slot);
        await h.setSegment(slot, start);
        const manual = await ensureMode(slot, false);
        const before = snap(slot, action + '-before');
        const key = await trusted(reader, action);
        await sleep(650);
        const after = snap(slot, action + '-after');
        row.actions.push({ action, manual, key, before, after, expectation: { trustedConsumed: key.result?.keyDown === 1, paused: after.paused === true, following: after.following === true, modeA: after.ui.text === 'A' && after.ui.pressed === 'true', changedOrReturn: action === 'returnToSpoken' ? after.following === true : after.position !== before.position } });
      }
    } catch (e) { row.error = String(e); }
    await ensureMode(slot, true);
    rows.push(row);
  }
  return JSON.stringify({ rows }, null, 1);
})()
