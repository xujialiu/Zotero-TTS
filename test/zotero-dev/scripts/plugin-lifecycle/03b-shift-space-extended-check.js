// Follow-up to 03: the first Shift+Space on a never-yet-activated manager
// (fresh fixture, first provider/voice-list load) took ~11.9s to flip the
// plugin's mirrored `playerOpen`, past 03's 12s ceiling, with `active` not
// yet true at the last sample -- found live 2026-09-25. A longer ceiling to
// see whether `active` (and not just the popup mirror) follows, and to
// leave the reader closed again afterward. Reuses fixture C; imports and
// attaches nothing new.
// params: none. state: reads fixtures.c; writes shiftSpaceExtended.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const c = state.fixtures?.c;
  if (!c) throw new Error('state.fixtures.c missing; run 03 first');
  const win = Zotero.getMainWindow();
  const readerC = (Zotero.Reader?._readers || []).find((r) => r?.itemID === c.id);
  if (!readerC) throw new Error('fixture C reader not found');

  const doc = () => readerC._iframeWindow.document;
  const m = () => readerC._internalReader?._readAloudManager;
  const nativeDisplay = () => {
    const d = doc();
    const popup = d.querySelector('.read-aloud-popup');
    const cs = (el) => (el ? d.defaultView.getComputedStyle(el).display : 'ABSENT');
    return cs(popup);
  };
  const playerOpenState = () => {
    try { const frame = doc().getElementById('ztts-player-frame'); return !!frame && !frame.hidden; } catch (e) { return null; }
  };

  const preState = { active: !!m()?.active, playerOpen: playerOpenState() };
  if (preState.active || preState.playerOpen) throw new Error('reader not idle before the extended check: ' + JSON.stringify(preState));

  const trustedKey = (targetWin, { key, code, keyCode, shiftKey }) => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(targetWin);
    try {
      const flags = { shiftKey: false };
      if (shiftKey) { flags.shiftKey = true; tip.keydown(new targetWin.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, ...flags, bubbles: true, cancelable: true })); }
      const consumed = tip.keydown(new targetWin.KeyboardEvent('', { key, code, keyCode, ...flags, bubbles: true, cancelable: true }));
      tip.keyup(new targetWin.KeyboardEvent('', { key, code, keyCode, ...flags, bubbles: true, cancelable: true }));
      if (shiftKey) { tip.keyup(new targetWin.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, ...flags, bubbles: true, cancelable: true })); }
      return consumed;
    } finally { tip.endInputTransaction?.(); }
  };

  win.Zotero_Tabs.select(readerC.tabID);
  readerC._iframeWindow?.focus?.();
  win.focus();
  await sleep(200);

  const trace = [{ t: 0, popup: nativeDisplay(), playerOpen: playerOpenState(), active: !!m()?.active }];
  const consumed = trustedKey(win, { key: ' ', code: 'Space', keyCode: 32, shiftKey: true });
  const t0 = Date.now();
  let playerOpenAt = null, activeAt = null;
  while (Date.now() - t0 < 30000) {
    const sample = { t: Date.now() - t0, popup: nativeDisplay(), playerOpen: playerOpenState(), active: !!m()?.active, selectedVoiceID: m()?.selectedVoiceID ?? null };
    trace.push(sample);
    if (sample.playerOpen && playerOpenAt === null) playerOpenAt = sample.t;
    if (sample.active && activeAt === null) activeAt = sample.t;
    if (playerOpenAt !== null && activeAt !== null) break;
    await sleep(200);
  }

  const out = {
    consumed,
    playerOpenAt,
    activeAt,
    allPopupNoneOrAbsent: trace.every((s) => s.popup === 'none' || s.popup === 'ABSENT'),
    samples: trace.length,
    last: trace[trace.length - 1],
  };

  // Stop any reading and close the Player again, as the brief asks.
  try { readerC._internalReader.toggleReadAloudPopup(false); } catch (e) {}
  for (let i = 0; i < 60; i++) { if (!m()?.active) break; await sleep(100); }
  try { const btn = doc().getElementById('ztts-player-toggle'); if (btn && playerOpenState()) btn.click(); } catch (e) {}
  await sleep(200);
  out.afterStop = { active: !!m()?.active, playerOpen: playerOpenState() };

  state.shiftSpaceExtended = out;
  return JSON.stringify(out, null, 1);
})()
