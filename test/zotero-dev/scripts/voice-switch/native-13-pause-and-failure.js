return (async () => {
  const state = Zotero.__ztts95NativeState;
  const itemID = Zotero.__ztts95Fixture?.itemID;
  const reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!state || !reader || !manager) throw new Error('fixture manager is missing');
  const rw = reader._iframeWindow;
  const sameName = 'extensions.zotero.zotero-tts.readAloud.sameForAllDocuments';
  const sameOriginal = { value: Services.prefs.getBoolPref(sameName), user: Services.prefs.prefHasUserValue(sameName) };
  Services.prefs.setBoolPref(sameName, false);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const readerIndex = (Zotero.Reader._readers || []).indexOf(reader);
  const diag = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()).readers?.[readerIndex]?.handoff ?? null;
  const read = () => ({ active: !!manager.active, paused: !!manager.paused, selected: manager.selectedVoiceID ?? null, position: manager._controller?._position ?? null, currentIndex: manager._controller?._currentIndex ?? null });
  const reset = async voiceID => {
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} await sleep(90); }
    if (manager.selectedVoiceID !== voiceID) manager.selectVoice(voiceID);
    await sleep(90);
    const mw = Components.utils.waiveXrays(manager);
    mw._activeSegment = null; mw._activeTimestampIndex = null; mw._backwardStopIndex = 0; mw._paused = false;
    manager._createController();
    for (let i = 0; i < 25 && (!manager.active || !manager._controller?._sourceNode || manager._controller._currentIndex !== 0); i++) await sleep(50);
  };
  const pressNext = () => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(rw);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev('.', 'Period', 190, true)), tip.keyup(ev('.', 'Period', 190, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  };
  const waitStage = async (terminal, max = 25) => {
    const trace = [];
    for (let i = 0; i < max; i++) {
      const h = diag(); trace.push({ ms: i * 100, state: read(), handoff: h });
      if (terminal.includes(h?.stage)) break;
      await sleep(100);
    }
    return trace;
  };
  const out = {};
  try {
    state.noTimestamps = false; state.failNext = false; state.failVoiceID = null; state.delayMs = 900;
    await reset('native95-a');
    state.calls.length = 0;
    const pauseOld = manager._controller;
    const pauseKey = pressNext();
    const beforePause = { state: read(), handoff: diag() };
    await sleep(220);
    manager.pause();
    const afterPause = { state: read(), handoff: diag() };
    await sleep(1100);
    out.pause = {
      key: pauseKey,
      beforePause,
      afterPause,
      afterDelay: { state: read(), handoff: diag(), oldAlive: !pauseOld._destroyed, controllerIsOld: manager._controller === pauseOld },
      targetCalls: state.calls.filter(c => c.voiceID === 'native95-b').map(c => ({ kind: c.kind, text: c.text })),
    };

    state.delayMs = 0; state.failVoiceID = 'native95-b'; state.calls.length = 0;
    await sleep(100);
    await reset('native95-a');
    const failOld = manager._controller;
    const failKey = pressNext();
    const failTrace = await waitStage(['failed', 'committed', 'cancelled'], 20);
    const toast = rw.document.getElementById('ztts-speed-toast')?.textContent ?? null;
    out.failure = {
      key: failKey,
      trace: failTrace,
      final: { state: read(), handoff: diag(), oldAlive: !failOld._destroyed, controllerIsOld: manager._controller === failOld, toast },
      targetCalls: state.calls.filter(c => c.voiceID === 'native95-b').map(c => ({ kind: c.kind, text: c.text })),
    };
  } finally {
    state.delayMs = 0; state.failNext = false; state.failVoiceID = null; state.noTimestamps = false;
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
    if (sameOriginal.user) Services.prefs.setBoolPref(sameName, sameOriginal.value);
    else if (sameOriginal.value) Services.prefs.clearUserPref(sameName);
  }
  out.restored = { sameForAllDocuments: { value: Services.prefs.getBoolPref(sameName), user: Services.prefs.prefHasUserValue(sameName) } };
  return JSON.stringify(out, null, 1);
})()
