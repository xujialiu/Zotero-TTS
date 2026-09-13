return (async () => {
  const state = Zotero.__ztts95NativeState;
  const aID = Zotero.__ztts95Fixture?.itemID, bID = Zotero.__ztts95FixtureB?.itemID;
  const ra = (Zotero.Reader._readers || []).find(r => r?.itemID === aID), rb = (Zotero.Reader._readers || []).find(r => r?.itemID === bID);
  const ma = ra?._internalReader?._readAloudManager, mb = rb?._internalReader?._readAloudManager;
  if (!state || !ra || !rb || !ma || !mb) throw new Error('both fixture managers are required');
  const sameName = 'extensions.zotero.zotero-tts.readAloud.sameForAllDocuments';
  const original = { value: Services.prefs.getBoolPref(sameName), user: Services.prefs.prefHasUserValue(sameName) };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const reset = async (m, id, playing) => {
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} await sleep(100); }
    if (m.selectedVoiceID !== id) m.selectVoice(id);
    await sleep(100);
    const mw = Components.utils.waiveXrays(m);
    mw._activeSegment = null; mw._activeTimestampIndex = null; mw._backwardStopIndex = 0; mw._paused = !playing;
    m._createController();
    for (let i = 0; i < 20 && (!m.active || !m._controller?._sourceNode || m._controller._currentIndex !== 0); i++) await sleep(50);
  };
  const ia = (Zotero.Reader._readers || []).indexOf(ra), ib = (Zotero.Reader._readers || []).indexOf(rb);
  const read = m => ({ active: !!m.active, paused: !!m.paused, selected: m.selectedVoiceID ?? null, pos: m._controller?._position ?? null, current: m._controller?._currentIndex ?? null });
  const handoff = i => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()).readers?.[i]?.handoff ?? null;
  try {
    Services.prefs.setBoolPref(sameName, false);
    state.delayMs = 0; state.noTimestamps = false; state.failNext = false; state.failVoiceID = null;
    await reset(ma, 'native95-a', false); await reset(mb, 'native95-a', false);
    await reset(ma, 'native95-a', true); await reset(mb, 'native95-a', true);
    const setup = { a: read(ma), b: read(mb) };
    Services.prefs.setBoolPref(sameName, true); state.calls.length = 0; state.delayMs = 500;
    const trigger = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(1, ia));
    await sleep(2200);
    const result = { a: { state: read(ma), handoff: handoff(ia) }, b: { state: read(mb), handoff: handoff(ib) } };
    const targetCalls = state.calls.filter(c => c.voiceID === 'native95-b').map(c => ({ kind: c.kind, text: c.text }));
    if (ma.active && !ma.paused) ma.pause(); if (mb.active && !mb.paused) mb.pause();
    return JSON.stringify({ setup, triggerReaders: trigger.readers?.length ?? null, result, targetCalls, restoredSame: { value: Services.prefs.getBoolPref(sameName), user: Services.prefs.prefHasUserValue(sameName) } }, null, 1);
  } finally {
    state.delayMs = 0; state.noTimestamps = false; state.failNext = false; state.failVoiceID = null;
    if (ma.active && !ma.paused) { try { ma.pause(); } catch (e) {} }
    if (mb.active && !mb.paused) { try { mb.pause(); } catch (e) {} }
    if (original.user) Services.prefs.setBoolPref(sameName, original.value);
    else if (original.value) Services.prefs.clearUserPref(sameName);
  }
})()
