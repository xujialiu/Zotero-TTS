return (async () => {
  const state = Zotero.__ztts95NativeState;
  const aID = Zotero.__ztts95Fixture?.itemID, bID = Zotero.__ztts95FixtureB?.itemID;
  const ra = (Zotero.Reader._readers || []).find(r => r?.itemID === aID);
  const rb = (Zotero.Reader._readers || []).find(r => r?.itemID === bID);
  const ma = ra?._internalReader?._readAloudManager, mb = rb?._internalReader?._readAloudManager;
  if (!state || !ra || !rb || !ma || !mb) throw new Error('both fixture managers are required');
  const sameName = 'extensions.zotero.zotero-tts.readAloud.sameForAllDocuments';
  const original = { value: Services.prefs.getBoolPref(sameName), user: Services.prefs.prefHasUserValue(sameName) };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const reset = async (m, id, playing) => {
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} await sleep(80); }
    if (m.selectedVoiceID !== id) m.selectVoice(id);
    await sleep(80);
    const mw = Components.utils.waiveXrays(m);
    mw._activeSegment = null; mw._activeTimestampIndex = null; mw._backwardStopIndex = 0; mw._paused = !playing;
    m._createController();
    for (let i = 0; i < 20 && (!m.active || !m._controller?._sourceNode || m._controller._currentIndex !== 0); i++) await sleep(50);
  };
  const stateOf = m => ({ active: !!m.active, paused: !!m.paused, selected: m.selectedVoiceID ?? null, pos: m._controller?._position ?? null, current: m._controller?._currentIndex ?? null });
  const handoffOf = index => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()).readers?.[index]?.handoff ?? null;
  const ia = (Zotero.Reader._readers || []).indexOf(ra), ib = (Zotero.Reader._readers || []).indexOf(rb);
  const trigger = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(1, ia));
  const wait = async ms => { await sleep(ms); return { a: handoffOf(ia), b: handoffOf(ib), aState: stateOf(ma), bState: stateOf(mb) }; };
  const out = {};
  try {
    state.delayMs = 500; state.noTimestamps = false; state.failNext = false; state.failVoiceID = null;
    Services.prefs.setBoolPref(sameName, false);
    await reset(ma, 'native95-a', true); await reset(mb, 'native95-a', true);
    out.setupOn = { a: stateOf(ma), b: stateOf(mb) };
    Services.prefs.setBoolPref(sameName, true); state.calls.length = 0;
    const onTrigger = trigger(); const onResult = await wait(2200);
    out.sameOn = { trigger: { readers: onTrigger.readers?.length ?? null }, result: onResult, targetBCalls: state.calls.filter(c => c.voiceID === 'native95-b').length };
    if (ma.active && !ma.paused) ma.pause(); if (mb.active && !mb.paused) mb.pause();

    Services.prefs.setBoolPref(sameName, false); await sleep(100);
    await reset(ma, 'native95-a', true); await reset(mb, 'native95-a', true); state.calls.length = 0;
    const offTrigger = trigger(); const offResult = await wait(2200);
    out.setupOff = { a: stateOf(ma), b: stateOf(mb) };
    out.sameOff = { trigger: { readers: offTrigger.readers?.length ?? null }, result: offResult, targetBCalls: state.calls.filter(c => c.voiceID === 'native95-b').length };
    if (ma.active && !ma.paused) ma.pause(); if (mb.active && !mb.paused) mb.pause();

    Services.prefs.setBoolPref(sameName, true); await sleep(100);
    await reset(ma, 'native95-a', true); await reset(mb, 'native95-a', false); state.calls.length = 0;
    const pausedTrigger = trigger(); const pausedResult = await wait(2200);
    out.pausedOther = { trigger: { readers: pausedTrigger.readers?.length ?? null }, result: pausedResult, targetBCalls: state.calls.filter(c => c.voiceID === 'native95-b').length };
  } finally {
    state.delayMs = 0; state.noTimestamps = false; state.failNext = false; state.failVoiceID = null;
    if (ma.active && !ma.paused) { try { ma.pause(); } catch (e) {} }
    if (mb.active && !mb.paused) { try { mb.pause(); } catch (e) {} }
    if (original.user) Services.prefs.setBoolPref(sameName, original.value);
    else if (original.value) Services.prefs.clearUserPref(sameName);
  }
  out.restored = { sameForAllDocuments: { value: Services.prefs.getBoolPref(sameName), user: Services.prefs.prefHasUserValue(sameName) } };
  return JSON.stringify(out, null, 1);
})()
