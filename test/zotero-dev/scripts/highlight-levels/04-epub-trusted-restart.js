// Same reason as 03-audio-probe.js: the EPUB's first session was also
// started from chrome script, so its controller's AudioContext is stuck
// suspended. Close and restart it with a trusted Shift+Space (audio is
// confirmed available on this machine), then pause again.
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = Zotero.getMainWindow ? Zotero.getMainWindow() : Services.wm.getMostRecentWindow('navigator:browser');
  const fixtures = Zotero.ZoteroTTSRun.state.fixtures;
  const readerEpub = (Zotero.Reader._readers || []).find((r) => r.itemID === fixtures.epub.itemID);
  if (!readerEpub) throw new Error('EPUB reader missing');

  readerEpub._internalReader.toggleReadAloudPopup(false);
  await sleep(400);

  win.Zotero_Tabs.select(readerEpub.tabID);
  readerEpub.focus?.();
  win.focus();

  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const ev = (key, code, keyCode, shiftKey = false) => new win.KeyboardEvent('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
  tip.beginInputTransactionForTests(win);
  const keyRet = [
    tip.keydown(ev('Shift', 'ShiftLeft', 16)),
    tip.keydown(ev(' ', 'Space', 32, true)),
    tip.keyup(ev(' ', 'Space', 32, true)),
    tip.keyup(ev('Shift', 'ShiftLeft', 16)),
  ];
  if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();

  await sleep(700);
  const manager = readerEpub._internalReader._readAloudManager;
  const c = manager?._controller;
  const probe1 = { state: c?._audioContext?.state ?? null, t: c?._audioContext?.currentTime ?? null };
  await sleep(500);
  const probe2 = { state: manager?._controller?._audioContext?.state ?? null, t: manager?._controller?._audioContext?.currentTime ?? null };

  if (manager?.active && !manager?.paused) manager.togglePaused();
  await sleep(150);

  return JSON.stringify({ keyRet, probe1, probe2, selectedVoiceID: manager?.selectedVoiceID ?? null, active: !!manager?.active, paused: !!manager?.paused }, null, 1);
})();
