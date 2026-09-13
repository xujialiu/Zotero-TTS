return (async () => {
  const itemID = Zotero.__ztts95Fixture?.itemID;
  const reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!reader || !manager) throw new Error('fixture manager is missing');
  const name = 'extensions.zotero.zotero-tts.readAloud.memory';
  const original = Zotero.__ztts95Baseline?.prefs?.['readAloud.memory'];
  if (!original) throw new Error('baseline memory is missing');
  const memory = JSON.stringify({ speed: 1, voice: { id: 'native95-a', lang: 'en' } });
  Services.prefs.setStringPref(name, memory);
  let toggleError = null;
  try { internal.toggleReadAloudPopup(true); } catch (e) { toggleError = String(e); }
  const samples = [];
  for (let i = 0; i < 60; i++) {
    samples.push({
      ms: i * 100,
      active: !!manager.active,
      paused: !!manager.paused,
      selectedVoice: manager.selectedVoiceID ?? null,
      selectedTier: manager._selectedTier ?? null,
      allVoices: manager.allVoices?.length ?? null,
      voicesForLanguage: manager.voicesForLanguage?.length ?? null,
      segments: manager._segments?.length ?? null,
      position: Number.isFinite(manager._controller?._position) ? manager._controller._position : null,
    });
    if (manager.allVoices?.length && manager._segments?.length) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (manager.active && !manager.paused) {
    try { manager.pause(); } catch (e) {}
  }
  const final = samples[samples.length - 1] ?? null;
  const state = Zotero.__ztts95NativeState;
  return JSON.stringify({
    toggleError,
    final,
    sampleCount: samples.length,
    calls: state?.calls?.map(c => ({ kind: c.kind, voiceID: c.voiceID, text: c.text })) ?? [],
    memoryTemporary: { chars: memory.length, user: Services.prefs.prefHasUserValue(name) },
  }, null, 1);
})()
