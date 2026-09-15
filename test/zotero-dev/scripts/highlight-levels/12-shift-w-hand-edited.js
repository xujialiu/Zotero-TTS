// Redo of item 9 / 4.10's "hand-edited profile, both prefs false" press:
// 11's attempt left the settings window open (on General), and the
// Zotero-TTS pane stays resident once loaded (driving doc §1), so its own
// highlight-rows.ts watcher caught "both false" and wrote sentence back to
// true before the press ever ran. Closing the settings window stops that
// watcher, so the raw prefs actually hold {false,false} for the press.
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let win = Services.wm.getMostRecentWindow('zotero:pref');
  if (win) {
    win.close();
    const until = Date.now() + 5000;
    while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() < until) await sleep(100);
  }

  const mainWin = Zotero.getMainWindow ? Zotero.getMainWindow() : Services.wm.getMostRecentWindow('navigator:browser');
  const fixtures = Zotero.ZoteroTTSRun.state.fixtures;
  const readerA = (Zotero.Reader._readers || []).find((r) => r.itemID === fixtures.a.itemID);
  mainWin.Zotero_Tabs.select(readerA.tabID);
  readerA.focus?.();
  mainWin.focus();
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const ev = (key, code, keyCode, shiftKey = false) => new mainWin.KeyboardEvent('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
  function pressShiftW() {
    tip.beginInputTransactionForTests(mainWin);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev('W', 'KeyW', 87, true)), tip.keyup(ev('W', 'KeyW', 87, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  }
  const toastText = () => readerA._iframeWindow.document.getElementById('ztts-speed-toast')?.textContent ?? null;
  const levels = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels());

  Zotero.Prefs.set('zotero-tts.highlight.sentence', false);
  Zotero.Prefs.set('zotero-tts.highlight.word', false);
  await sleep(100);
  const rawBefore = { sentence: Zotero.Prefs.get('zotero-tts.highlight.sentence'), word: Zotero.Prefs.get('zotero-tts.highlight.word') };
  const ret = pressShiftW();
  await sleep(150);
  const after = { switches: levels().switches, toast: toastText() };

  // Restore both true -- the run's steady state -- and reopen the pane on Highlight for later scripts
  Zotero.Prefs.set('zotero-tts.highlight.sentence', true);
  Zotero.Prefs.set('zotero-tts.highlight.word', true);

  return JSON.stringify({ paneWasOpenBefore: !!win, rawBefore, ret, after }, null, 1);
})();
