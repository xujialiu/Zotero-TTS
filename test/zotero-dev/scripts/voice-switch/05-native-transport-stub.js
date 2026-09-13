return (async () => {
  const itemID = Zotero.__ztts95Fixture?.itemID;
  if (!itemID) throw new Error('fixture identity is missing');
  const list = Zotero.Reader._readers || [];
  let current = null;
  for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) { current = list[i]; break; }
  if (current) {
    try { current._internalReader?.toggleReadAloudPopup(false); } catch (e) {}
    try { current.close?.(); } catch (e) {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const existing = (Zotero.Reader._readers || []).find(r => r?.itemID !== itemID);
  const proto = existing ? Object.getPrototypeOf(existing) : Object.getPrototypeOf(Zotero.Reader);
  const original = proto?._getReadAloudRemoteInterface;
  if (typeof original !== 'function') throw new Error('native remote interface method is missing');
  const state = {
    calls: [],
    delayMs: 0,
    delayVoiceID: null,
    failNext: false,
    failVoiceID: null,
    noTimestamps: false,
    audioDuration: 2,
    patchRestored: false,
    patchHeld: false,
    remoteInjected: false,
    readerWindow: null,
  };
  const windowFor = segment => {
    if (segment && typeof segment === 'object') {
      try { return Components.utils.getGlobalForObject(segment); } catch (e) {}
    }
    return state.readerWindow;
  };
  const wav = (seconds = 2, targetWindow = state.readerWindow) => {
    const rate = 8000;
    const frames = Math.max(1, Math.round(rate * seconds));
    const bytes = 44 + frames * 2;
    const data = new Uint8Array(bytes);
    const view = new DataView(data.buffer);
    const put = (at, text) => { for (let i = 0; i < text.length; i++) data[at + i] = text.charCodeAt(i); };
    put(0, 'RIFF'); view.setUint32(4, bytes - 8, true); put(8, 'WAVE'); put(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); put(36, 'data'); view.setUint32(40, frames * 2, true);
    // Silence is deterministic and keeps the fixture muted even if volume changes.
    const BlobCtor = targetWindow?.Blob ?? Blob;
    return new BlobCtor([data], { type: 'audio/wav' });
  };
  const timestamps = text => {
    const rows = [];
    const re = /[\p{L}\p{N}\p{M}'’]+/gu;
    let m;
    while ((m = re.exec(text)) !== null) rows.push({ start: 0, end: 0, charStart: m.index, charEnd: m.index + m[0].length });
    const n = rows.length || 1;
    const span = Math.max(0.1, state.audioDuration - 0.1);
    for (let i = 0; i < rows.length; i++) { rows[i].start = 0.05 + i * (span / n); rows[i].end = 0.05 + (i + 1) * (span / n); }
    return rows;
  };
  const voiceIDs = ['native95-a', 'native95-b', 'native95-c', 'native95-d'];
  const catalog = {
    voices: Object.fromEntries(voiceIDs.map(id => [id, { label: 'Native Fixture ' + id.slice(-1).toUpperCase() }])),
    locales: { 'en-US': voiceIDs },
    segmentGranularity: 'word',
    sentenceDelay: 0,
    cacheVersion: 'voice-switch-fixture-v1',
  };
  const nativeStub = {
    getVoices: () => Components.utils.cloneInto({
      voices: { standard: [catalog], premium: [], local: [] },
      standardCreditsRemaining: 0,
      premiumCreditsRemaining: 0,
    }, state.readerWindow),
    getAudio: (segment, voice) => {
      const targetWindow = windowFor(segment);
      const text = segment === 'sample' ? 'sample' : String(segment?.text ?? '');
      const voiceID = String(voice?.id ?? '');
      state.calls.push({ kind: segment === 'sample' ? 'sample' : 'segment', voiceID, text, at: Date.now() });
      const result = () => {
        if (state.failNext || state.failVoiceID === voiceID) {
          state.failNext = false;
          if (state.failVoiceID === voiceID) state.failVoiceID = null;
          return Components.utils.cloneInto({ audio: null, error: 'fixture-native-failure', noStore: true }, targetWindow);
        }
        const audio = wav(state.audioDuration, targetWindow);
        if (segment === 'sample') return Components.utils.cloneInto({ audio, marker: 'voice-switch-fixture-sample' }, targetWindow);
        return Components.utils.cloneInto({
          audio,
          marker: 'voice-switch-fixture-segment',
          timestamps: state.noTimestamps ? undefined : timestamps(text),
        }, targetWindow);
      };
      if (state.delayMs > 0 && (!state.delayVoiceID || state.delayVoiceID === voiceID) && targetWindow?.Promise) {
        return new targetWindow.Promise(resolve => targetWindow.setTimeout(() => resolve(result()), state.delayMs));
      }
      return result();
    },
    getCreditsRemaining: () => Components.utils.cloneInto({ standardCreditsRemaining: 0, premiumCreditsRemaining: 0 }, state.readerWindow),
    resetCredits: () => Components.utils.cloneInto({ standardCreditsRemaining: 0, premiumCreditsRemaining: 0 }, state.readerWindow),
  };
  state.voiceIDs = voiceIDs;
  state.catalog = catalog;
  state.nativeStub = nativeStub;
  const fixtureRemote = function () { return nativeStub; };
  proto._getReadAloudRemoteInterface = fixtureRemote;
  let opened = false;
  let error = null;
  try {
    Zotero.__ztts95NativeState = state;
    Zotero.__ztts95NativeState.nativeStub = nativeStub;
    Zotero.__ztts95NativeState.original = original;
    Zotero.__ztts95NativeState.proto = proto;
    Zotero.Reader.open(itemID);
    opened = true;
    for (let i = 0; i < 60; i++) {
      const fixture = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
      if (fixture?._iframeWindow) state.readerWindow = fixture._iframeWindow;
      const hit = fixture?._internalReader?._readAloudManager ? fixture : null;
      if (hit) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    state.patchHeld = true;
  } catch (e) { error = String(e); }
  const reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
  const manager = reader?._internalReader?._readAloudManager;
  state.readerWindow = reader?._iframeWindow ?? null;
  if (manager && reader?._iframeWindow) {
    const options = Components.utils.waiveXrays(manager._options);
    const internal = Components.utils.waiveXrays(reader._internalReader);
    state.originalRemoteInterface = options.remoteInterface;
    state.originalInternalRemoteInterface = internal._readAloudRemoteInterface;
    const cloned = Components.utils.cloneInto(nativeStub, reader._iframeWindow, { cloneFunctions: true });
    options.remoteInterface = cloned;
    internal._readAloudRemoteInterface = cloned;
    state.remoteInjected = options.remoteInterface === cloned && internal._readAloudRemoteInterface === cloned;
  }
  return JSON.stringify({
    opened,
    error,
    patchHeld: state.patchHeld,
    patchRestored: state.patchRestored,
    remoteInjected: state.remoteInjected,
    readerReady: !!manager,
    manager: manager ? {
      active: !!manager.active,
      paused: !!manager.paused,
      selectedVoice: manager.selectedVoiceID ?? null,
      selectedTier: manager._selectedTier ?? null,
      allVoices: manager.allVoices?.length ?? null,
      voicesForLanguage: manager.voicesForLanguage?.length ?? null,
      segmentGranularity: manager._segmentGranularity ?? null,
      segments: manager._segments?.length ?? null,
    } : null,
  }, null, 1);
})()
