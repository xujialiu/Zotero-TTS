return (async () => {
  const itemID = Zotero.__ztts97Fixture?.itemID;
  if (!itemID) throw new Error('fixture identity is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const list = Zotero.Reader._readers || [];
  let current = null;
  for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) { current = list[i]; break; }
  if (current) {
    try { current._internalReader?.toggleReadAloudPopup(false); } catch (e) {}
    try { current.close?.(); } catch (e) {}
    await sleep(250);
  }
  let existing = null;
  const readers = Zotero.Reader._readers || [];
  for (let i = 0; i < readers.length; i++) if (readers[i]?.itemID !== itemID) { existing = readers[i]; break; }
  const proto = existing ? Object.getPrototypeOf(existing) : Object.getPrototypeOf(Zotero.Reader);
  const original = proto?._getReadAloudRemoteInterface;
  if (typeof original !== 'function') throw new Error('native remote interface method is missing');
  const defs = [
    { id: 'regional97-a', label: 'Regional Fixture A', language: 'en-US' },
    { id: 'regional97-b', label: 'Generic Fixture B', language: 'en' },
    { id: 'regional97-c', label: 'Regional Fixture C', language: 'en-US' },
    { id: 'regional97-wild', label: 'Wildcard Fixture', language: '*' },
    { id: 'regional97-gb', label: 'British Fixture', language: 'en-GB' },
  ];
  const catalog = {
    voices: Object.fromEntries(defs.map(v => [v.id, { label: v.label, language: v.language }])) ,
    locales: {
      'en-US': ['regional97-a', 'regional97-c'],
      en: ['regional97-b'],
      '*': ['regional97-wild'],
      'en-GB': ['regional97-gb'],
    },
    segmentGranularity: 'sentence',
    sentenceDelay: 0,
    cacheVersion: 'voice-switch-regional-v1',
  };
  const state = {
    calls: [],
    catalog,
    defs,
    readerWindow: null,
    nativeStub: null,
    original,
    proto,
    patchHeld: false,
    patchRestored: false,
    remoteInjected: false,
    audioDuration: 2,
  };
  const clone = (value, target) => {
    try { return target ? Components.utils.cloneInto(value, target, { cloneFunctions: true }) : value; }
    catch (e) { return value; }
  };
  const windowFor = segment => {
    if (segment && typeof segment === 'object') {
      try { return Components.utils.getGlobalForObject(segment); } catch (e) {}
    }
    return state.readerWindow;
  };
  const wav = (seconds, target) => {
    const rate = 8000;
    const frames = Math.max(1, Math.round(rate * seconds));
    const bytes = 44 + frames * 2;
    const data = new Uint8Array(bytes);
    const view = new DataView(data.buffer);
    const put = (at, value) => { for (let i = 0; i < value.length; i++) data[at + i] = value.charCodeAt(i); };
    put(0, 'RIFF'); view.setUint32(4, bytes - 8, true); put(8, 'WAVE'); put(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); put(36, 'data'); view.setUint32(40, frames * 2, true);
    const BlobCtor = target?.Blob ?? Blob;
    return new BlobCtor([data], { type: 'audio/wav' });
  };
  const timestamps = text => {
    const rows = [];
    const re = /[\p{L}\p{N}\p{M}'’]+/gu;
    let match;
    while ((match = re.exec(text)) !== null) rows.push({ start: 0.05, end: 0.15, charStart: match.index, charEnd: match.index + match[0].length });
    const n = rows.length || 1;
    for (let i = 0; i < rows.length; i++) {
      rows[i].start = 0.05 + i * (1.8 / n);
      rows[i].end = 0.05 + (i + 1) * (1.8 / n);
    }
    return rows;
  };
  const nativeStub = {
    getVoices: () => clone({
      voices: { standard: [catalog], premium: [], local: [] },
      standardCreditsRemaining: 0,
      premiumCreditsRemaining: 0,
    }, state.readerWindow),
    getAudio: (segment, voice) => {
      const target = windowFor(segment);
      const sample = segment === 'sample';
      const text = sample ? 'sample' : String(segment?.text ?? '');
      const voiceID = String(voice?.id ?? '');
      state.calls.push({ kind: sample ? 'sample' : 'segment', voiceID, text, at: Date.now() });
      const result = {
        audio: wav(state.audioDuration, target),
        marker: sample ? 'voice-switch-regional-sample' : 'voice-switch-regional-segment',
      };
      if (!sample) result.timestamps = timestamps(text);
      return clone(result, target);
    },
    getCreditsRemaining: () => clone({ standardCreditsRemaining: 0, premiumCreditsRemaining: 0 }, state.readerWindow),
    resetCredits: () => clone({ standardCreditsRemaining: 0, premiumCreditsRemaining: 0 }, state.readerWindow),
  };
  state.nativeStub = nativeStub;
  const fixtureRemote = function () { return nativeStub; };
  proto._getReadAloudRemoteInterface = fixtureRemote;
  let opened = false;
  let error = null;
  try {
    Zotero.__ztts97NativeState = state;
    Zotero.Reader.open(itemID);
    opened = true;
    for (let i = 0; i < 60; i++) {
      const fixture = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
      if (fixture?._iframeWindow) state.readerWindow = fixture._iframeWindow;
      if (fixture?._internalReader?._readAloudManager) break;
      await sleep(100);
    }
    state.patchHeld = true;
  } catch (e) { error = String(e); }
  const fixture = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
  const internal = fixture?._internalReader;
  const manager = internal?._readAloudManager;
  state.readerWindow = fixture?._iframeWindow ?? state.readerWindow;
  if (manager && state.readerWindow) {
    const mw = Components.utils.waiveXrays(manager);
    const iw = Components.utils.waiveXrays(internal);
    const options = Components.utils.waiveXrays(manager._options);
    state.originalRemoteInterface = options.remoteInterface;
    state.originalInternalRemoteInterface = iw._readAloudRemoteInterface;
    const injected = Components.utils.cloneInto(nativeStub, state.readerWindow, { cloneFunctions: true });
    options.remoteInterface = injected;
    iw._readAloudRemoteInterface = injected;
    state.remoteInjected = options.remoteInterface === injected && iw._readAloudRemoteInterface === injected;
    try { await manager.loadVoices(true); } catch (e) { state.reloadError = String(e); }
    await sleep(150);
    state.manager = manager;
    state.reader = fixture;
    state.managerSnapshot = {
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
  }
  const menu = [];
  if (manager) {
    const a = manager.voicesForLanguage || [];
    for (let i = 0; i < a.length; i++) menu.push({ index: i, id: a[i]?.id ?? null, label: a[i]?.label ?? null, language: a[i]?.language ?? null });
  }
  return JSON.stringify({
    opened,
    error,
    patchHeld: state.patchHeld,
    patchRestored: state.patchRestored,
    remoteInjected: state.remoteInjected,
    readerReady: !!manager,
    manager: state.managerSnapshot ?? null,
    menu,
    calls: state.calls.map(c => ({ kind: c.kind, voiceID: c.voiceID, text: c.text })),
  }, null, 1);
})()
