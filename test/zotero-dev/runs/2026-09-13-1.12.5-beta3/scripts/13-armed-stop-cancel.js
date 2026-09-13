return (async () => {
  const state = Zotero.__ztts95NativeState;
  const itemID = Zotero.__ztts95Fixture?.itemID;
  const reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!state || !reader || !manager) throw new Error('fixture manager is missing');
  const rw = reader._iframeWindow;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} await sleep(100); }
  const mw = Components.utils.waiveXrays(manager);
  if (manager.selectedVoiceID !== 'native95-a') manager.selectVoice('native95-a');
  await sleep(80);
  mw._activeSegment = null; mw._activeTimestampIndex = null; mw._backwardStopIndex = 0; mw._paused = false;
  manager._createController();
  for (let i = 0; i < 25 && (!manager.active || !manager._controller?._sourceNode || manager._controller._currentIndex !== 0); i++) await sleep(50);
  const old = manager._controller;
  if (!old || old._currentIndex !== 0) throw new Error('old fixture controller did not reach segment zero');
  const node = old._sourceNode;
  const nw = Components.utils.waiveXrays(node);
  const nodeDescriptor = Object.getOwnPropertyDescriptor(nw, 'stop');
  const nativeStop = nw.stop;
  state.calls.length = 0; state.stopCalls = []; state.delayMs = 0; state.noTimestamps = false; state.failNext = false; state.failVoiceID = null;
  nw.stop = function (when) {
    state.stopCalls.push({ when: Number.isFinite(when) ? when : null, clock: old._audioContext?.currentTime ?? null });
    return Reflect.apply(nativeStop, this, arguments);
  };
  const readerIndex = (Zotero.Reader._readers || []).indexOf(reader);
  const diag = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()).readers?.[readerIndex]?.handoff ?? null;
  const read = () => ({ active: !!manager.active, paused: !!manager.paused, selected: manager.selectedVoiceID ?? null, position: manager._controller?._position ?? null, currentIndex: manager._controller?._currentIndex ?? null, oldAlive: !old._destroyed });
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const K = rw.KeyboardEvent;
  const ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
  Zotero_Tabs.select(reader.tabID); reader.focus?.(); rw.focus?.();
  tip.beginInputTransactionForTests(rw);
  const keyRet = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev('.', 'Period', 190, true)), tip.keyup(ev('.', 'Period', 190, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
  const trace = [];
  for (let i = 0; i < 25; i++) {
    const h = diag(); trace.push({ ms: i * 50, state: read(), handoff: h, stopCalls: state.stopCalls.slice() });
    if (h?.stage === 'word' || h?.stage === 'failed' || h?.stage === 'cancelled') break;
    await sleep(50);
  }
  const armed = { state: read(), handoff: diag(), stopCalls: state.stopCalls.slice() };
  if (diag()?.stage === 'word') manager.pause();
  await sleep(120);
  const cancelled = { state: read(), handoff: diag(), stopCalls: state.stopCalls.slice() };
  if (nodeDescriptor) Object.defineProperty(nw, 'stop', nodeDescriptor); else delete nw.stop;
  state.delayMs = 0;
  return JSON.stringify({
    keyRet,
    armed,
    cancelled,
    oldController: { destroyed: !!old._destroyed, context: old._audioContext?.state ?? null },
    lateStop: armed.stopCalls.length > 0 && cancelled.stopCalls.length > armed.stopCalls.length && Number.isFinite(cancelled.stopCalls.at(-1)?.when) && cancelled.stopCalls.at(-1).when > armed.stopCalls[0].when,
  }, null, 1);
})()
