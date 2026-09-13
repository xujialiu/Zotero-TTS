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
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} await sleep(80); }
    if (manager.selectedVoiceID !== voiceID) manager.selectVoice(voiceID);
    await sleep(80);
    const mw = Components.utils.waiveXrays(manager);
    mw._activeSegment = null; mw._activeTimestampIndex = null; mw._backwardStopIndex = 0; mw._paused = false;
    manager._createController();
    for (let i = 0; i < 25 && (!manager.active || !manager._controller?._sourceNode || manager._controller._currentIndex !== 0); i++) await sleep(50);
  };
  const press = (key, code, keyCode) => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const ev = (value, valueCode, valueKeyCode, shiftKey = false) => new K('', { key: value, code: valueCode, keyCode: valueKeyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(rw);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(key, code, keyCode, true)), tip.keyup(ev(key, code, keyCode, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  };
  const waitTerminal = async (max = 30) => {
    const trace = [];
    for (let i = 0; i < max; i++) {
      const h = diag(); trace.push({ ms: i * 100, state: read(), handoff: h });
      if (h?.stage === 'committed' || h?.stage === 'failed' || h?.stage === 'cancelled') break;
      await sleep(100);
    }
    return trace;
  };
  const out = {};
  try {
    state.noTimestamps = false; state.failNext = false; state.failVoiceID = null; state.delayMs = 700;
    await reset('native95-a');
    state.calls.length = 0;
    const rapidOld = manager._controller;
    const rapidKey1 = press('.', 'Period', 190);
    await sleep(35);
    const rapidKey2 = press('.', 'Period', 190);
    const rapidPending = diag();
    const rapidTrace = await waitTerminal(32);
    const rapidFinal = { state: read(), handoff: diag(), oldAlive: !rapidOld._destroyed };
    out.rapid = {
      keys: { first: rapidKey1, second: rapidKey2 },
      pendingAfterKeys: rapidPending,
      trace: rapidTrace,
      final: rapidFinal,
      targetCalls: state.calls.filter(c => c.voiceID === 'native95-c').map(c => ({ kind: c.kind, text: c.text })),
    };
    if (manager.active && !manager.paused) manager.pause();

    state.delayMs = 900; state.calls.length = 0;
    await sleep(100);
    await reset('native95-a');
    const cancelOld = manager._controller;
    const cancelNext = press('.', 'Period', 190);
    await sleep(35);
    const cancelBack = press(',', 'Comma', 188);
    const cancelImmediate = diag();
    await sleep(1200);
    out.returnCurrent = {
      keys: { next: cancelNext, previous: cancelBack },
      immediate: cancelImmediate,
      final: { state: read(), handoff: diag(), oldAlive: !cancelOld._destroyed },
      targetCalls: state.calls.map(c => ({ kind: c.kind, voiceID: c.voiceID, text: c.text })),
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
