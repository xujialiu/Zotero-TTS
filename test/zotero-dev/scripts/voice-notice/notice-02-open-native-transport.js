return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, fixtures = state.fixtures || [];
  const Cu = Components.utils, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  if (fixtures.length !== 2) throw new Error('issue 119 fixtures are missing');
  const defs = [
    { id: 'native119-a', label: 'Issue 119 Fixture A', language: 'en-US', tier: 'standard' },
    { id: 'native119-b', label: 'Issue 119 Fixture B', language: 'en-US', tier: 'standard' },
    { id: 'native119-c', label: 'Issue 119 Fixture C', language: 'en-US', tier: 'standard' },
  ];
  const makeCatalog = () => ({
    voices: Object.fromEntries(defs.map(v => [v.id, { label: v.label }])),
    locales: { 'en-US': defs.map(v => v.id), en: defs.map(v => v.id) },
    segmentGranularity: 'sentence', sentenceDelay: 0, cacheVersion: 'issue119-native-v1',
  });
  const transport = {
    defs, calls: [], responses: [], delayMs: 0, delayByVoice: {}, failVoiceID: null,
    noTimestampsVoiceID: null, audioDuration: 20, readers: {}, proto: null,
    original: null, window: null, nextCall: 0,
  };
  const clone = (value, target) => Cu.cloneInto(value, target, { cloneFunctions: true });
  const callerWindow = self => {
    try {
      const global = Cu.getGlobalForObject(self);
      if (global?.document) return global;
    } catch (e) {}
    return transport.window;
  };
  const windowFor = segment => { try { return Cu.getGlobalForObject(segment); } catch (e) { return transport.window; } };
  const wav = (seconds, target) => {
    const rate = 8000, frames = Math.max(1, Math.round(rate * seconds));
    const bytes = 44 + frames * 2, data = new Uint8Array(bytes), view = new DataView(data.buffer);
    const put = (at, text) => { for (let i = 0; i < text.length; i++) data[at + i] = text.charCodeAt(i); };
    put(0, 'RIFF'); view.setUint32(4, bytes - 8, true); put(8, 'WAVE'); put(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); put(36, 'data'); view.setUint32(40, frames * 2, true);
    return new (target?.Blob ?? Blob)([data], { type: 'audio/wav' });
  };
  const timestamps = text => {
    const rows = [], re = /[\p{L}\p{N}\p{M}'’]+/gu; let match;
    while ((match = re.exec(text)) !== null) rows.push({ start: 0, end: 0, charStart: match.index, charEnd: match.index + match[0].length });
    const span = Math.max(0.1, transport.audioDuration - 0.1), n = rows.length || 1;
    for (let i = 0; i < rows.length; i++) { rows[i].start = 0.05 + i * span / n; rows[i].end = 0.05 + (i + 1) * span / n; }
    return rows;
  };
  const nativeStub = {
    getVoices: function () { return clone({ voices: { standard: [makeCatalog()] }, standardCreditsRemaining: 0, premiumCreditsRemaining: 0 }, callerWindow(this)); },
    getAudio: (segment, voice) => {
      const target = windowFor(segment), sample = segment === 'sample';
      const text = sample ? 'sample' : String(segment?.text ?? ''), voiceID = String(voice?.id ?? '');
      const call = { id: ++transport.nextCall, kind: sample ? 'sample' : 'segment', voiceID, text, at: Date.now() };
      transport.calls.push(call);
      const result = () => {
        if (transport.failVoiceID === voiceID) {
          transport.responses.push({ callId: call.id, kind: call.kind, voiceID, ok: false, at: Date.now() });
          return clone({ audio: null, error: 'issue119-fixture-failure', noStore: true }, target);
        }
        transport.responses.push({ callId: call.id, kind: call.kind, voiceID, ok: true, at: Date.now() });
        const output = { audio: wav(transport.audioDuration, target), marker: 'issue119-segment' };
        if (sample) output.marker = 'issue119-sample';
        else if (transport.noTimestampsVoiceID !== voiceID) output.timestamps = timestamps(text);
        return clone(output, target);
      };
      const delay = Number(transport.delayByVoice[voiceID] ?? transport.delayMs);
      if (delay > 0 && target?.Promise) return new target.Promise(resolve => target.setTimeout(() => resolve(result()), delay));
      return result();
    },
    getCreditsRemaining: function () { return clone({ standardCreditsRemaining: 0, premiumCreditsRemaining: 0 }, callerWindow(this)); },
    resetCredits: function () { return clone({ standardCreditsRemaining: 0, premiumCreditsRemaining: 0 }, callerWindow(this)); },
  };
  transport.nativeStub = nativeStub;
  const list = Zotero.Reader._readers || [];
  let owner = null;
  for (let i = 0; i < list.length; i++) if (!fixtures.some(f => f.itemID === list[i]?.itemID)) { owner = list[i]; break; }
  const proto = owner ? Object.getPrototypeOf(owner) : null, original = proto?._getReadAloudRemoteInterface;
  if (typeof original !== 'function') throw new Error('native remote interface method is missing');
  transport.proto = proto; transport.original = original;
  proto._getReadAloudRemoteInterface = function (...args) {
    return fixtures.some(f => f.itemID === this.itemID) ? nativeStub : Reflect.apply(original, this, args);
  };
  const readersFor = itemID => {
    const rows = Zotero.Reader._readers || [];
    for (let i = 0; i < rows.length; i++) if (rows[i]?.itemID === itemID) return rows[i];
    return null;
  };
  const idsOf = values => { const out = []; for (let i = 0; i < (values?.length ?? 0); i++) if (values[i]?.id) out.push(String(values[i].id)); return out; };
  Services.prefs.setStringPref('extensions.zotero.zotero-tts.readAloud.memory', JSON.stringify({ speed: 1, voice: { id: 'native119-a', lang: 'en' } }));
  for (const fixture of fixtures) {
    Zotero.Reader.open(fixture.itemID);
    let reader = null;
    for (let i = 0; i < 70; i++) { reader = readersFor(fixture.itemID); if (reader?._internalReader?._readAloudManager) break; await sleep(100); }
    if (!reader?._internalReader?._readAloudManager) throw new Error(`${fixture.kind} manager did not become ready`);
    const internal = reader._internalReader, manager = internal._readAloudManager;
    await sleep(500);
    const options = Cu.waiveXrays(manager._options), internalWaived = Cu.waiveXrays(internal);
    transport.window = reader._iframeWindow;
    const originalRemote = options.remoteInterface, originalInternalRemote = internalWaived._readAloudRemoteInterface;
    const injected = clone(nativeStub, reader._iframeWindow);
    options.remoteInterface = injected; internalWaived._readAloudRemoteInterface = injected;
    const entry = { itemID: fixture.itemID, tabID: reader.tabID, reader, internal, manager,
      window: reader._iframeWindow, originalRemote, originalInternalRemote };
    try { Zotero.getMainWindow?.().Zotero_Tabs?.select(reader.tabID); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (e) {}
    try { internal.toggleReadAloudPopup(true); } catch (e) { entry.popupError = String(e); }
    for (let i = 0; i < 70; i++) { if (manager.allVoices?.length && manager._segments?.length && manager.selectedVoiceID) break; await sleep(100); }
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
    await sleep(250);
    const rwManager = Cu.waiveXrays(manager);
    entry.initial = { active: !!manager.active, paused: !!manager.paused, popupOpen: !!internal._state?.readAloudState?.popupOpen,
      selected: manager.selectedVoiceID ?? null, tier: manager._selectedTier ?? null, lang: manager.lang ?? null,
      allVoices: idsOf(rwManager.allVoices), segments: manager._segments?.length ?? null };
    transport.readers[fixture.kind] = entry;
  }
  state.transport = transport;
  const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()), fixturesOut = {};
  for (const kind of ['pdf', 'epub']) {
    const index = (Zotero.Reader._readers || []).indexOf(transport.readers[kind].reader);
    fixturesOut[kind] = d.readers?.[index] ?? null;
  }
  const ok = ['pdf', 'epub'].every(kind => transport.readers[kind].initial?.selected === 'native119-a')
    && ['pdf', 'epub'].every(kind => fixturesOut[kind]?.handoff?.controlsAttached === true);
  return JSON.stringify({ status: ok ? 'PASS' : 'FAIL', readers: Object.fromEntries(Object.entries(transport.readers).map(([k, v]) => [k, v.initial])),
    diagnostics: { mechanism: d.mechanism, bindings: d.bindings, fixtures: fixturesOut }, calls: transport.calls.map(({ kind, voiceID, text }) => ({ kind, voiceID, text })) }, null, 1);
})()
