return (async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fixtures = state.fixtures || [];
  if (fixtures.length !== 2) throw new Error('108 fixtures are missing');
  const defs = [
    { id: 'native108-a', label: 'Issue 108 Fixture A', language: 'en-US', tier: 'standard' },
    { id: 'native108-b', label: 'Issue 108 Fixture B', language: 'en-US', tier: 'standard' },
    { id: 'native108-gb', label: 'Issue 108 Fixture GB', language: 'en-GB', tier: 'standard' },
    { id: 'native108-en', label: 'Issue 108 Fixture English', language: 'en', tier: 'standard' },
    { id: 'native108-p1', label: 'Issue 108 Fixture Premium 1', language: 'en-US', tier: 'premium' },
    { id: 'native108-p2', label: 'Issue 108 Fixture Premium 2', language: 'en-US', tier: 'premium' },
    { id: 'native108-pgb', label: 'Issue 108 Fixture Premium GB', language: 'en-GB', tier: 'premium' },
    { id: 'native108-l1', label: 'Issue 108 Fixture Local 1', language: 'en-US', tier: 'local' },
  ];
  const byTier = tier => defs.filter(v => v.tier === tier);
  const makeCatalog = (tier, cacheVersion) => {
    const values = byTier(tier);
    const voices = Object.fromEntries(values.map(v => [v.id, { label: v.label }]));
    const locales = {};
    for (const voice of values) (locales[voice.language] ||= []).push(voice.id);
    return { voices, locales, segmentGranularity: 'sentence', sentenceDelay: 0, cacheVersion };
  };
  const transport = {
    defs,
    calls: [],
    delayMs: 0,
    delayVoiceID: null,
    failVoiceID: null,
    noTimestampsVoiceID: null,
    audioDuration: 4,
    readers: {},
    proto: null,
    original: null,
    restored: false,
  };
  const clone = (value, target) => Components.utils.cloneInto(value, target, { cloneFunctions: true });
  const windowFor = segment => {
    try { return Components.utils.getGlobalForObject(segment); } catch (e) { return transport.window; }
  };
  const wav = (seconds, target) => {
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
    return new (target?.Blob ?? Blob)([data], { type: 'audio/wav' });
  };
  const timestamps = text => {
    const rows = [];
    const re = /[\p{L}\p{N}\p{M}'’]+/gu;
    let match;
    while ((match = re.exec(text)) !== null) rows.push({ start: 0, end: 0, charStart: match.index, charEnd: match.index + match[0].length });
    const span = Math.max(0.1, transport.audioDuration - 0.1), n = rows.length || 1;
    for (let i = 0; i < rows.length; i++) {
      rows[i].start = 0.05 + i * span / n;
      rows[i].end = 0.05 + (i + 1) * span / n;
    }
    return rows;
  };
  const nativeStub = {
    getVoices: () => clone({
      voices: {
        standard: [makeCatalog('standard', 'issue108-native-v1')],
        premium: [makeCatalog('premium', 'issue108-native-v1')],
        local: [makeCatalog('local', 'issue108-native-v1')],
      },
      standardCreditsRemaining: 0,
      premiumCreditsRemaining: 0,
    }, transport.window),
    getAudio: (segment, voice) => {
      const target = windowFor(segment);
      const sample = segment === 'sample';
      const text = sample ? 'sample' : String(segment?.text ?? '');
      const voiceID = String(voice?.id ?? '');
      transport.calls.push({ kind: sample ? 'sample' : 'segment', voiceID, text, at: Date.now() });
      const result = () => {
        if (transport.failVoiceID === voiceID) return clone({ audio: null, error: 'issue108-fixture-failure', noStore: true }, target);
        const audio = wav(transport.audioDuration, target);
        if (sample) return clone({ audio, marker: 'issue108-sample' }, target);
        const output = { audio, marker: 'issue108-segment' };
        if (transport.noTimestampsVoiceID !== voiceID) output.timestamps = timestamps(text);
        return clone(output, target);
      };
      if (transport.delayMs > 0 && (!transport.delayVoiceID || transport.delayVoiceID === voiceID) && target?.Promise) {
        return new target.Promise(resolve => target.setTimeout(() => resolve(result()), transport.delayMs));
      }
      return result();
    },
    getCreditsRemaining: () => clone({ standardCreditsRemaining: 0, premiumCreditsRemaining: 0 }, transport.window),
    resetCredits: () => clone({ standardCreditsRemaining: 0, premiumCreditsRemaining: 0 }, transport.window),
  };
  transport.nativeStub = nativeStub;
  const list = Zotero.Reader._readers || [];
  let owner = null;
  for (let i = 0; i < list.length; i++) {
    if (!fixtures.some(f => f.itemID === list[i]?.itemID)) { owner = list[i]; break; }
  }
  const proto = owner ? Object.getPrototypeOf(owner) : null;
  const original = proto?._getReadAloudRemoteInterface;
  if (typeof original !== 'function') throw new Error('native remote interface method is missing');
  transport.proto = proto;
  transport.original = original;
  proto._getReadAloudRemoteInterface = function (...args) {
    return fixtures.some(f => f.itemID === this.itemID) ? nativeStub : Reflect.apply(original, this, args);
  };
  state.transport = transport;

  const readersFor = itemID => {
    const rows = Zotero.Reader._readers || [];
    for (let i = 0; i < rows.length; i++) if (rows[i]?.itemID === itemID) return rows[i];
    return null;
  };
  const idsOf = list => {
    const out = [];
    for (let i = 0; i < (list?.length ?? 0); i++) if (list[i]?.id) out.push(String(list[i].id));
    return out;
  };
  const memoryName = 'extensions.zotero.zotero-tts.readAloud.memory';
  Services.prefs.setStringPref(memoryName, JSON.stringify({ speed: 1, voice: { id: 'native108-a', lang: 'en' } }));
  for (const fixture of fixtures) {
    Zotero.Reader.open(fixture.itemID);
    let reader = null;
    for (let i = 0; i < 70; i++) {
      reader = readersFor(fixture.itemID);
      if (reader?._internalReader?._readAloudManager) break;
      await sleep(100);
    }
    if (!reader?._internalReader?._readAloudManager) throw new Error(`${fixture.kind} manager did not become ready`);
    const internal = reader._internalReader;
    const manager = internal._readAloudManager;
    const options = Components.utils.waiveXrays(manager._options);
    const waivedInternal = Components.utils.waiveXrays(internal);
    transport.window = reader._iframeWindow;
    transport.readers[fixture.kind] = {
      itemID: fixture.itemID, tabID: reader.tabID, reader, internal, manager,
      window: reader._iframeWindow, originalRemote: options.remoteInterface,
      originalInternalRemote: waivedInternal._readAloudRemoteInterface,
    };
    const injected = clone(nativeStub, reader._iframeWindow);
    options.remoteInterface = injected;
    waivedInternal._readAloudRemoteInterface = injected;
    try { Zotero.getMainWindow?.().Zotero_Tabs?.select(reader.tabID); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (e) {}
    try { internal.toggleReadAloudPopup(true); } catch (e) { transport.readers[fixture.kind].popupError = String(e); }
    for (let i = 0; i < 70; i++) {
      if (manager.allVoices?.length && manager._segments?.length && manager.selectedVoiceID) break;
      await sleep(100);
    }
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
    await sleep(250);
    const rwManager = Components.utils.waiveXrays(manager);
    transport.readers[fixture.kind].injected = options.remoteInterface === waivedInternal._readAloudRemoteInterface;
    transport.readers[fixture.kind].initial = {
      active: !!manager.active, paused: !!manager.paused, popupOpen: !!internal._state?.readAloudState?.popupOpen,
      selected: manager.selectedVoiceID ?? null, lang: manager.lang ?? null, region: manager.region ?? null,
      tier: manager._selectedTier ?? null, allVoices: idsOf(rwManager.allVoices), segments: manager._segments?.length ?? null,
    };
  }
  state.transport = transport;
  const diagnostics = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch());
  const rows = {};
  for (const kind of ['pdf', 'epub']) {
    const index = (Zotero.Reader._readers || []).indexOf(transport.readers[kind].reader);
    rows[kind] = diagnostics.readers?.[index] ?? null;
  }
  return JSON.stringify({
    status: 'PASS', readers: Object.fromEntries(Object.entries(transport.readers).map(([kind, row]) => [kind, row.initial])),
    catalog: defs.map(({ id, label, language, tier }) => ({ id, label, language, tier })),
    diagnostics: { mechanism: diagnostics.mechanism, bindings: diagnostics.bindings, fixtures: rows },
    calls: transport.calls.map(({ kind, voiceID, text }) => ({ kind, voiceID, text })),
  }, null, 1);
})()
