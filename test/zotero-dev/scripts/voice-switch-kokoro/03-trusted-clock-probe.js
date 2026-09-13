return (async () => {
  const fixture = Zotero.__ztts95Kokoro?.fixtureA;
  const reader = fixture?.reader;
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  if (!reader || !manager) return JSON.stringify({ status: 'FAIL', error: 'fixture manager is missing' }, null, 1);
  try { Zotero_Tabs.select(reader.tabID); } catch (e) {}
  try { reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (e) {}
  const rw = reader._iframeWindow;
  const before = {
    active: !!manager.active, paused: !!manager.paused,
    audioState: manager._controller?._audioContext?.state ?? null,
    audioTime: manager._controller?._audioContext?.currentTime ?? null,
    position: Number.isFinite(manager._controller?._position) ? manager._controller._position : null,
  };
  let keyError = null;
  let returns = null;
  try {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const ev = (key, code, keyCode) => new K('', { key, code, keyCode, bubbles: true, cancelable: true });
    tip.beginInputTransactionForTests(rw);
    returns = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32)),
      tip.keyup(ev(' ', 'Space', 32)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
  } catch (e) { keyError = String(e); }
  const trace = [];
  for (let i = 0; i < 16; i++) {
    const controller = manager._controller;
    trace.push({ ms: i * 100, active: !!manager.active, paused: !!manager.paused,
      position: Number.isFinite(controller?._position) ? controller._position : null,
      currentIndex: Number.isFinite(controller?._currentIndex) ? controller._currentIndex : null,
      audioState: controller?._audioContext?.state ?? null,
      audioTime: Number.isFinite(controller?._audioContext?.currentTime) ? controller._audioContext.currentTime : null,
      progress: Number.isFinite(controller?._currentPlaybackTime) ? controller._currentPlaybackTime : null,
      source: !!controller?._sourceNode, selected: manager.selectedVoiceID ?? null });
    await sleep(100);
  }
  const after = trace.at(-1) ?? null;
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
  const times = trace.map(row => row.audioTime).filter(value => Number.isFinite(value));
  const advanced = times.length >= 2 && times.at(-1) > times[0] + 0.05;
  return JSON.stringify({ status: advanced ? 'PASS' : 'NOT TESTABLE', before, keyError, keyReturns: returns,
    trace: { count: trace.length, first: trace[0] ?? null, last: trace.at(-1) ?? null },
    clockAdvanced: advanced, pausedAfter: !!manager.paused }, null, 1);
})()
