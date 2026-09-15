// baseline.md's audio probe, redone here because A's first session was
// started from chrome script (toggleReadAloudPopup(true) with no trusted
// gesture), which the design note says leaves the AudioContext suspended
// for that controller's whole life. Close A's session and restart it with
// a genuine trusted Shift+Space, then read the new controller's
// AudioContext state twice ~500 ms apart -- running + the clock moving
// means the machine can actually play; frozen means every
// live-position/"speaks within Ns" check this run attempts is NOT
// TESTABLE (machine), while every state/pref/DOM mechanism check still
// stands on the paused session.
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = Zotero.getMainWindow ? Zotero.getMainWindow() : Services.wm.getMostRecentWindow('navigator:browser');
  const fixtures = Zotero.ZoteroTTSRun.state.fixtures;
  const readerA = (Zotero.Reader._readers || []).find((r) => r.itemID === fixtures.a.itemID);
  if (!readerA) throw new Error('fixture A reader missing');

  readerA._internalReader.toggleReadAloudPopup(false);
  await sleep(400);
  const closedActive = !!readerA._internalReader._readAloudManager?.active;

  win.Zotero_Tabs.select(readerA.tabID);
  readerA.focus?.();
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
  const manager = readerA._internalReader._readAloudManager;
  const c1 = manager?._controller;
  const probe1 = { state: c1?._audioContext?.state ?? null, t: c1?._audioContext?.currentTime ?? null, active: !!manager?.active, paused: !!manager?.paused, selectedVoiceID: manager?.selectedVoiceID ?? null };
  await sleep(500);
  const c2 = manager?._controller;
  const probe2 = { state: c2?._audioContext?.state ?? null, t: c2?._audioContext?.currentTime ?? null, sameController: c1 === c2 };

  const clockMoving = probe1.t !== null && probe2.t !== null && probe2.t > probe1.t;
  const running = probe2.state === 'running';

  // Pause again either way -- our own fixture, and the rest of this kit assumes A paused
  if (manager?.active && !manager?.paused) manager.togglePaused();
  await sleep(150);

  return JSON.stringify({ closedActive, keyRet, probe1, probe2, running, clockMoving, verdict: running && clockMoving ? 'audio available' : 'frozen (NOT TESTABLE: machine)' }, null, 1);
})();
