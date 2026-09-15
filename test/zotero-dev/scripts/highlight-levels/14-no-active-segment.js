// 4.10's "No active segment": after fixture A ends, the controller rewinds
// and _activeSegment is null; press Shift+W there and check the switch,
// pref and state still flip, the last highlight stays where it was, and
// the next segment draws at the new level. Runs long (fixture A plays to
// its end at its current speed) -- meant for the group runner/background
// wait, not one().
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = Zotero.getMainWindow ? Zotero.getMainWindow() : Services.wm.getMostRecentWindow('navigator:browser');
  const fixtures = Zotero.ZoteroTTSRun.state.fixtures;
  const readerA = (Zotero.Reader._readers || []).find((r) => r.itemID === fixtures.a.itemID);
  const mA = readerA._internalReader._readAloudManager;
  const viewA = readerA._internalReader._primaryView;
  win.Zotero_Tabs.select(readerA.tabID);
  readerA.focus?.();
  win.focus();

  // _activeSegment lives on the MANAGER, not the controller (found live:
  // mA._controller?._activeSegment and mA.activeSegment both read
  // undefined the whole way through, so the loop below spun to its ceiling
  // without ever recognizing the end -- the underlying end-of-document
  // state was reached well before that ceiling regardless, confirmed by a
  // follow-up read (manager paused itself, _controller._position back to
  // 0). Poll the correct property so a future run detects it directly.
  const activeSegment = () => (mA._activeSegment === undefined ? 'unknown' : mA._activeSegment);
  if (mA.active && mA.paused) mA.togglePaused();

  const until = Date.now() + 90000;
  let endedAt = null;
  let lastRect = null;
  while (Date.now() < until) {
    const seg = activeSegment();
    if (viewA._readAloudHighlightedPosition) lastRect = (viewA._readAloudHighlightedPosition.rects ?? []).length;
    if (seg === null && mA.active === true) {
      endedAt = Date.now();
      break;
    }
    await sleep(1000);
  }

  const beforePress = { activeSegment: activeSegment(), active: !!mA.active, paused: !!mA.paused, lastRectCount: lastRect, switches: JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels()).switches };

  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const ev = (key, code, keyCode, shiftKey = false) => new win.KeyboardEvent('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
  tip.beginInputTransactionForTests(win);
  const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev('W', 'KeyW', 87, true)), tip.keyup(ev('W', 'KeyW', 87, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
  if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
  await sleep(200);
  const afterPress = { switches: JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels()).switches, zoteroPref: Zotero.Prefs.get('reader.readAloud.highlightGranularity'), rectUnchanged: ((viewA._readAloudHighlightedPosition?.rects ?? []).length) === lastRect };

  // Put Word back on
  tip.beginInputTransactionForTests(win);
  tip.keydown(ev('Shift', 'ShiftLeft', 16));
  tip.keydown(ev('W', 'KeyW', 87, true));
  tip.keyup(ev('W', 'KeyW', 87, true));
  tip.keyup(ev('Shift', 'ShiftLeft', 16));
  if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
  await sleep(200);
  const restored = { switches: JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels()).switches };

  return JSON.stringify({ timedOut: endedAt === null, waitedMs: (endedAt ?? Date.now()) - (until - 90000), beforePress, ret, afterPress, restored }, null, 1);
})();
