// 4.10's reader-picking scenarios, run once each: EPUB via the key (spot-
// light color, pure read like 06's), the truly idle reader B, the library
// tab with nothing speaking, and two tabs with A speaking in the
// background. Fixture A is paused+both-on at the start (12's end state).
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = Zotero.getMainWindow ? Zotero.getMainWindow() : Services.wm.getMostRecentWindow('navigator:browser');
  const fixtures = Zotero.ZoteroTTSRun.state.fixtures;
  const readerA = (Zotero.Reader._readers || []).find((r) => r.itemID === fixtures.a.itemID);
  const readerB = (Zotero.Reader._readers || []).find((r) => r.itemID === fixtures.b.itemID);
  const readerEpub = (Zotero.Reader._readers || []).find((r) => r.itemID === fixtures.epub.itemID);
  const mA = readerA._internalReader._readAloudManager;
  const mB = readerB._internalReader._readAloudManager;
  const mEpub = readerEpub._internalReader._readAloudManager;

  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const ev = (w, key, code, keyCode, shiftKey = false) => new w.KeyboardEvent('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
  function pressShiftW(targetWin) {
    tip.beginInputTransactionForTests(targetWin);
    const ret = [
      tip.keydown(ev(targetWin, 'Shift', 'ShiftLeft', 16)),
      tip.keydown(ev(targetWin, 'W', 'KeyW', 87, true)),
      tip.keyup(ev(targetWin, 'W', 'KeyW', 87, true)),
      tip.keyup(ev(targetWin, 'Shift', 'ShiftLeft', 16)),
    ];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  }
  const levels = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels());
  const spotlightColor = (view, key) => {
    try { return Reflect.apply(view._getSpotlightColor, view, [key]); } catch (e) { return 'ERROR:' + String(e); }
  };

  // --- EPUB via the key: select it, press on the main window ---
  win.Zotero_Tabs.select(readerEpub.tabID);
  readerEpub.focus?.();
  win.focus();
  const epubBefore = { segment: spotlightColor(readerEpub._internalReader._primaryView, 'ReadAloudActiveSegment'), switches: levels().switches };
  const epubRet = pressShiftW(win);
  await sleep(150);
  const epubAfter = { segment: spotlightColor(readerEpub._internalReader._primaryView, 'ReadAloudActiveSegment'), switches: levels().switches, toast: readerEpub._iframeWindow.document.getElementById('ztts-speed-toast')?.textContent ?? null };
  pressShiftW(win); // put Word back on
  await sleep(150);

  // --- Idle reader B: select it, never opened a session ---
  win.Zotero_Tabs.select(readerB.tabID);
  readerB.focus?.();
  win.focus();
  const bBefore = { switches: levels().switches, active: !!mB.active, popupOpen: !!mB.popupOpen };
  const bRet = pressShiftW(win);
  await sleep(150);
  const bAfter = { switches: levels().switches, active: !!mB.active, popupOpen: !!mB.popupOpen, toast: readerB._iframeWindow.document.getElementById('ztts-speed-toast')?.textContent ?? null, hasPlayerPopup: !!readerB._iframeWindow.document.querySelector('.read-aloud-popup') };
  pressShiftW(win); // put Word back on (idle reader, just flips the shared switch)
  await sleep(150);

  // --- Library tab, nothing speaking ---
  win.Zotero_Tabs.select('zotero-pane');
  await sleep(150);
  const libBefore = { switches: levels().switches };
  const libRet = pressShiftW(win);
  await sleep(150);
  const libAfter = { switches: levels().switches, toastInMainWin: win.document.getElementById('ztts-speed-toast')?.textContent ?? null };

  // --- Two tabs: A speaking (resumed) in the background, B selected+idle ---
  win.Zotero_Tabs.select(readerA.tabID);
  if (mA.active && mA.paused) mA.togglePaused();
  await sleep(300);
  win.Zotero_Tabs.select(readerB.tabID); // B selected, A now hidden but speaking
  await sleep(150);
  const twoTabsBefore = { switches: levels().switches, aSpeaking: mA.active && !mA.paused, aSelected: win.Zotero_Tabs.selectedID === readerA.tabID, bSelected: win.Zotero_Tabs.selectedID === readerB.tabID };
  const twoTabsRet = pressShiftW(win);
  await sleep(150);
  const twoTabsAfter = {
    switches: levels().switches,
    aState: levels().readers.find((r) => r.itemID === fixtures.a.itemID)?.state,
    bState: levels().readers.find((r) => r.itemID === fixtures.b.itemID)?.state,
    toastInMainWin: win.document.getElementById('ztts-speed-toast')?.textContent ?? null,
    toastInAIframe: readerA._iframeWindow.document.getElementById('ztts-speed-toast')?.textContent ?? null,
    toastInBIframe: readerB._iframeWindow.document.getElementById('ztts-speed-toast')?.textContent ?? null,
  };
  // Restore Word on, re-pause A, select A
  pressShiftW(win);
  await sleep(150);
  if (mA.active && !mA.paused) mA.togglePaused();
  win.Zotero_Tabs.select(readerA.tabID);
  await sleep(100);
  const finalState = { switches: levels().switches, aPaused: !!mA.paused, aActive: !!mA.active };

  return JSON.stringify(
    { epubBefore, epubRet, epubAfter, bBefore, bRet, bAfter, libBefore, libRet, libAfter, twoTabsBefore, twoTabsRet, twoTabsAfter, finalState },
    null,
    1,
  );
})();
