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
  const ui = reader => { const mode = frameOf(reader)?.contentDocument?.querySelector('.mode'); return { text: mode?.textContent?.trim() || null, title: mode?.title || null, label: mode?.getAttribute('aria-label') || null, pressed: mode?.getAttribute('aria-pressed') || null }; };
  const snap = (slot, label) => { const reader = readerOf(slot?.itemID), m = managerOf(reader), c = m?._controller, d = h.diag(slot) || {}; return { label, itemID: slot?.itemID ?? null, tabID: reader?.tabID ?? null, position: c?._position ?? null, active: !!m?.active, paused: !!m?.paused, following: d.following ?? null, visibilityPaused: d.visibilityPaused ?? null, sentenceProtected: d.sentenceProtected ?? null, reason: d.reason ?? null, last: d.last ? { at: d.last.at, reason: d.last.reason, issued: d.last.issued, from: d.last.from } : null, ui: ui(reader) }; };
  const ensureMode = async (slot, expected) => { const reader = readerOf(slot?.itemID), d = h.diag(slot) || {}; if (!!d.following !== expected || d.sentenceProtected || d.visibilityPaused) frameOf(reader)?.contentDocument?.querySelector('.mode')?.click(); await waitFor(() => { const now = h.diag(slot), mode = ui(reader); return !!now && !!now.following === expected && mode.pressed === String(expected); }); await sleep(250); return snap(slot, expected ? 'automatic' : 'manual'); };
  const trustedReturn = async reader => {
    let result = null, error = null;
    try { reader.focus?.(); reader._iframeWindow?.focus?.(); const rw = reader._iframeWindow; const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor); const ev = (key, code, keyCode, shiftKey) => new rw.KeyboardEvent('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey }); tip.beginInputTransactionForTests(rw); result = { shiftDown: tip.keydown(ev('Shift', 'ShiftLeft', 16, true)), keyDown: tip.keydown(ev('Enter', 'Enter', 13, true)), keyUp: tip.keyup(ev('Enter', 'Enter', 13, true)), shiftUp: tip.keyup(ev('Shift', 'ShiftLeft', 16, false)) }; if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction(); } catch (e) { error = String(e); }
    return { result, error };
  };
  const directReturn = async reader => { let error = null; try { reader?._internalReader?._lockPositionToReadAloud?.(); reader?._internalReader?._readAloudManager?._stateChanged?.(); } catch (e) { error = String(e); } await sleep(550); return { error }; };
  if (!h) return JSON.stringify({ error: 'helpers missing' });
  const rows = [];
  for (const kind of ['pdf', 'epubScrolled', 'epubPaginated']) {
    const slot = state.fixtures?.[kind], reader = readerOf(slot?.itemID), manager = managerOf(reader); const row = { kind, itemID: slot?.itemID ?? null, tabID: reader?.tabID ?? null, error: null };
    if (!slot || !reader || !manager) { row.error = 'fixture reader or manager missing'; rows.push(row); continue; }
    try {
      h.select(slot);
      await h.pause(slot); await h.setSegment(slot, kind === 'pdf' ? 6 : kind === 'epubPaginated' ? 50 : 30); await ensureMode(slot, false);
      const beforeDirect = snap(slot, 'before-direct'); const direct = await directReturn(reader); const afterDirect = snap(slot, 'after-direct');
      await ensureMode(slot, false); const beforeTrusted = snap(slot, 'before-trusted'); const key = await trustedReturn(reader); await sleep(650); const afterTrusted = snap(slot, 'after-trusted');
      const play = frameOf(reader)?.contentDocument?.querySelector('.play'); if (manager.paused) { play?.click(); await waitFor(() => manager.active && !manager.paused); } const resumed = snap(slot, 'after-playing-resume'); if (!manager.paused) { play?.click(); await waitFor(() => manager.paused); }
      row.beforeDirect = beforeDirect; row.direct = direct; row.afterDirect = afterDirect; row.beforeTrusted = beforeTrusted; row.key = key; row.afterTrusted = afterTrusted; row.resumed = resumed;
      row.expectation = { directRestores: afterDirect.following === true, trustedConsumed: key.result?.keyDown === 1, trustedRestores: afterTrusted.following === true, trustedPaused: afterTrusted.paused === true, playingResumeRestores: resumed.following === true };
    } catch (e) { row.error = String(e); }
    try { await ensureMode(slot, true); } catch (e) { row.restoreError = String(e); }
    rows.push(row);
  }
  return JSON.stringify({ rows }, null, 1);
})()
