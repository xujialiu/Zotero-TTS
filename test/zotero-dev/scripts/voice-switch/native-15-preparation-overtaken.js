return (async () => {
  const state = Zotero.__ztts95NativeState;
  const itemID = Zotero.__ztts95Fixture?.itemID;
  const reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
  const manager = reader?._internalReader?._readAloudManager;
  if (!state || !reader || !manager) throw new Error('fixture manager is missing');
  const sameName = 'extensions.zotero.zotero-tts.readAloud.sameForAllDocuments';
  const sameOriginal = { value: Services.prefs.getBoolPref(sameName), user: Services.prefs.prefHasUserValue(sameName) };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const readerIndex = (Zotero.Reader._readers || []).indexOf(reader);
  const diag = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()).readers?.[readerIndex]?.handoff ?? null;
  const read = () => ({ active: !!manager.active, paused: !!manager.paused, selected: manager.selectedVoiceID ?? null, position: manager._controller?._position ?? null, currentIndex: manager._controller?._currentIndex ?? null });
  const reset = async () => {
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} await sleep(100); }
    if (manager.selectedVoiceID !== 'native95-a') manager.selectVoice('native95-a');
    await sleep(100);
    const mw = Components.utils.waiveXrays(manager);
    mw._activeSegment = null; mw._activeTimestampIndex = null; mw._backwardStopIndex = 0; mw._paused = false;
    manager._createController();
    for (let i = 0; i < 25 && (!manager.active || !manager._controller?._sourceNode || manager._controller._currentIndex !== 0); i++) await sleep(50);
  };
  let out = {};
  try {
    Services.prefs.setBoolPref(sameName, false);
    state.audioDuration = 0.4; state.delayMs = 1200; state.delayVoiceID = 'native95-b'; state.noTimestamps = false; state.failNext = false; state.failVoiceID = null; state.calls.length = 0;
    await reset();
    const before = read();
    const trigger = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(1, readerIndex));
    const trace = [];
    for (let i = 0; i < 34; i++) {
      trace.push({ ms: i * 100, state: read(), handoff: diag() });
      if (i < 33) await sleep(100);
    }
    const after = { state: read(), handoff: diag() };
    out = {
      before,
      trigger: { readers: trigger.readers?.length ?? null },
      trace,
      after,
      targetCalls: state.calls.filter(c => c.voiceID === 'native95-b').map(c => ({ kind: c.kind, text: c.text })),
      overtook: trace.some(row => (row.state.position ?? 0) > 0) && trace.some(row => (row.handoff?.prepared?.length ?? 0) > 1),
    };
  } finally {
    state.audioDuration = 2; state.delayMs = 0; state.delayVoiceID = null; state.noTimestamps = false; state.failNext = false; state.failVoiceID = null;
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
    if (sameOriginal.user) Services.prefs.setBoolPref(sameName, sameOriginal.value);
    else if (sameOriginal.value) Services.prefs.clearUserPref(sameName);
  }
  out.restored = { sameForAllDocuments: { value: Services.prefs.getBoolPref(sameName), user: Services.prefs.prefHasUserValue(sameName) } };
  return JSON.stringify(out, null, 1);
})()
