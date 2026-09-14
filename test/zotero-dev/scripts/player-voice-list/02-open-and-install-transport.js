return (async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const fixtures = state.fixtures || [];
  if (fixtures.length !== 2) throw new Error('fixtures are missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const readersFor = itemID => { const rs = Zotero.Reader._readers || []; for (let i = 0; i < rs.length; i++) if (rs[i]?.itemID === itemID) return rs[i]; return null; };
  const owner = (Zotero.Reader._readers || []).find(r => !fixtures.some(f => f.itemID === r?.itemID));
  const proto = owner ? Object.getPrototypeOf(owner) : null;
  const original = proto?._getReadAloudRemoteInterface;
  if (typeof original !== 'function') throw new Error('native remote interface method is missing');
  const defs = [
    { id: 'p106-us-a', label: 'Player Fixture US A', language: 'en-US' },
    { id: 'p106-us-b', label: 'Player Fixture US B', language: 'en-US' },
    { id: 'p106-adrian', label: 'Fish-cloud-Adrian', language: 'en' },
    { id: 'p106-wild', label: 'Player Fixture Wildcard', language: '*' },
    { id: 'p106-gb-a', label: 'Player Fixture GB A', language: 'en-GB' },
  ];
  const catalog = { voices: Object.fromEntries(defs.map(v => [v.id, { label: v.label, language: v.language }])),
    locales: { 'en-US': ['p106-us-a', 'p106-us-b'], en: ['p106-adrian'], '*': ['p106-wild'], 'en-GB': ['p106-gb-a'] },
    segmentGranularity: 'sentence', sentenceDelay: 0, cacheVersion: 'player-voice-list-106-v1' };
  const transport = { calls: [], defs, catalog, original, proto, readers: {}, restored: false };
  const clone = (value, target) => { try { return target ? Components.utils.cloneInto(value, target, { cloneFunctions: true }) : value; } catch (e) { return value; } };
  const wav = (seconds, target) => {
    const rate = 8000, frames = Math.max(1, Math.round(rate * seconds)), bytes = 44 + frames * 2, data = new Uint8Array(bytes), view = new DataView(data.buffer);
    const put = (at, value) => { for (let i = 0; i < value.length; i++) data[at + i] = value.charCodeAt(i); };
    put(0, 'RIFF'); view.setUint32(4, bytes - 8, true); put(8, 'WAVE'); put(12, 'fmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); put(36, 'data'); view.setUint32(40, frames * 2, true);
    return new (target?.Blob ?? Blob)([data], { type: 'audio/wav' });
  };
  const timestamps = text => {
    const rows = [], re = /[\p{L}\p{N}\p{M}'’]+/gu; let m;
    while ((m = re.exec(text)) !== null) rows.push({ start: 0.05, end: 0.15, charStart: m.index, charEnd: m.index + m[0].length });
    const n = rows.length || 1; for (let i = 0; i < rows.length; i++) { rows[i].start = 0.05 + i * (1.8 / n); rows[i].end = 0.05 + (i + 1) * (1.8 / n); }
    return rows;
  };
  const nativeStub = {
    getVoices: () => clone({ voices: { standard: [catalog], premium: [], local: [] }, standardCreditsRemaining: 0, premiumCreditsRemaining: 0 }, transport.window),
    getAudio: (segment, voice) => { const target = transport.window; const sample = segment === 'sample'; const text = sample ? 'sample' : String(segment?.text ?? '');
      transport.calls.push({ kind: sample ? 'sample' : 'segment', voiceID: String(voice?.id ?? ''), text });
      const result = { audio: wav(0.2, target), marker: sample ? 'player-voice-list-sample' : 'player-voice-list-segment' }; if (!sample) result.timestamps = timestamps(text);
      const PromiseCtor = target?.Promise ?? Promise; return PromiseCtor.resolve(clone(result, target)); },
    getCreditsRemaining: () => clone({ standardCreditsRemaining: 0, premiumCreditsRemaining: 0 }, transport.window),
    resetCredits: () => clone({ standardCreditsRemaining: 0, premiumCreditsRemaining: 0 }, transport.window),
  };
  transport.nativeStub = nativeStub;
  proto._getReadAloudRemoteInterface = function () { return nativeStub; };
  for (const fixture of fixtures) {
    Zotero.Reader.open(fixture.itemID);
    let reader = null;
    for (let i = 0; i < 70; i++) { reader = readersFor(fixture.itemID); if (reader?._internalReader?._readAloudManager) break; await sleep(100); }
    if (!reader?._internalReader?._readAloudManager) throw new Error(`${fixture.kind} manager did not become ready`);
    const internal = reader._internalReader, manager = internal._readAloudManager;
    transport.window = reader._iframeWindow;
    const mw = Components.utils.waiveXrays(manager), iw = Components.utils.waiveXrays(internal), options = Components.utils.waiveXrays(manager._options);
    transport.readers[fixture.kind] = { itemID: fixture.itemID, tabID: reader.tabID, reader, manager, internal, window: reader._iframeWindow,
      originalRemote: options.remoteInterface, originalInternalRemote: iw._readAloudRemoteInterface };
    options.remoteInterface = Components.utils.cloneInto(nativeStub, reader._iframeWindow, { cloneFunctions: true });
    iw._readAloudRemoteInterface = options.remoteInterface;
    try { Zotero.getMainWindow?.().Zotero_Tabs?.select(reader.tabID); } catch (e) {}
    try { internal.toggleReadAloudPopup(true); } catch (e) { transport.readers[fixture.kind].toggleError = String(e); }
    for (let i = 0; i < 50; i++) {
      if (manager.allVoices?.length && manager._segments?.length && manager.selectedVoiceID) break;
      await sleep(100);
    }
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
    await sleep(250);
    transport.readers[fixture.kind].injected = options.remoteInterface === iw._readAloudRemoteInterface;
    transport.readers[fixture.kind].initial = { active: !!manager.active, paused: !!manager.paused, selected: manager.selectedVoiceID ?? null,
      lang: manager.lang ?? null, region: manager.region ?? null, allVoices: manager.allVoices?.length ?? null, offered: manager.voicesForLanguage?.length ?? null };
  }
  state.transport = transport;
  const diagnostics = JSON.parse(Zotero.ZoteroTTS.diagnostics.playerVoiceList());
  return JSON.stringify({ readers: Object.fromEntries(Object.entries(transport.readers).map(([kind, r]) => [kind, r.initial])),
    diagnostic: diagnostics, catalog: defs, calls: transport.calls }, null, 1);
})()
