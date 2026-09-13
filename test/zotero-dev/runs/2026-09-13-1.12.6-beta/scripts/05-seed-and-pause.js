return (async () => {
  const state = Zotero.__ztts97NativeState;
  const itemID = Zotero.__ztts97Fixture?.itemID;
  const reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!state || !reader || !manager) throw new Error('fixture manager is missing');
  const memoryName = 'extensions.zotero.zotero-tts.readAloud.memory';
  const memory = JSON.stringify({ speed: 1.25, voice: { id: 'regional97-a', lang: 'en' } });
  Services.prefs.setStringPref(memoryName, memory);
  const beforeCalls = state.calls.length;
  let toggleError = null;
  try { internal.toggleReadAloudPopup(true); } catch (e) { toggleError = String(e); }
  const samples = [];
  for (let i = 0; i < 60; i++) {
    const row = {
      ms: i * 100,
      active: !!manager.active,
      paused: !!manager.paused,
      selectedVoice: manager.selectedVoiceID ?? null,
      selectedTier: manager._selectedTier ?? null,
      language: manager.lang ?? null,
      region: manager.region ?? null,
      allVoices: manager.allVoices?.length ?? null,
      voicesForLanguage: manager.voicesForLanguage?.length ?? null,
      segments: manager._segments?.length ?? null,
      position: Number.isFinite(manager._controller?._position) ? manager._controller._position : null,
    };
    samples.push(row);
    if (manager.allVoices?.length && manager._segments?.length && manager.selectedVoiceID) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (manager.active && !manager.paused) {
    try { manager.pause(); } catch (e) {}
  }
  await new Promise(resolve => setTimeout(resolve, 250));
  const menu = [];
  const voices = manager.voicesForLanguage || [];
  for (let i = 0; i < voices.length; i++) menu.push({ index: i, id: voices[i]?.id ?? null, label: voices[i]?.label ?? null, language: voices[i]?.language ?? null });
  const final = samples[samples.length - 1] ?? null;
  return JSON.stringify({
    toggleError,
    final,
    sampleCount: samples.length,
    callsBeforePause: beforeCalls,
    callsAfterPause: state.calls.length,
    calls: state.calls.map(c => ({ kind: c.kind, voiceID: c.voiceID, text: c.text })),
    menu,
    memoryTemporary: { chars: memory.length, user: Services.prefs.prefHasUserValue(memoryName) },
  }, null, 1);
})()
