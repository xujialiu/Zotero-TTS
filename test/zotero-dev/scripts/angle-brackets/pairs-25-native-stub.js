(async () => {
  const fixtureID = 24434;
  const nativeCalls = [];
  const voiceCalls = [];
  const errors = [];
  let existing = null;
  let targetReader = null;
  let proto = null;
  let original = null;
  let patchRestored = false;
  let fixtureClosed = false;
  let results = null;
  let voicesSummary = null;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const closeFixture = async () => {
    const current = Zotero.Reader._readers || [];
    for (let i = 0; i < current.length; i++) {
      if (current[i].itemID !== fixtureID) continue;
      try {
        const pending = current[i].close();
        if (pending && typeof pending.then === 'function') await pending;
      } catch (e) { errors.push('close: ' + String(e)); }
    }
    for (let i = 0; i < 40; i++) {
      let found = false;
      const now = Zotero.Reader._readers || [];
      for (let j = 0; j < now.length; j++) if (now[j].itemID === fixtureID) { found = true; break; }
      if (!found) { fixtureClosed = true; return; }
      await wait(100);
    }
  };
  const snapshotSegment = segment => {
    if (segment === 'sample') return { kind: 'sample' };
    const out = {
      kind: 'segment',
      text: segment?.text ?? null,
      lang: segment?.lang ?? null,
      paragraphStart: segment?.paragraphStart ?? null,
      position: null,
      sourcePosition: null,
    };
    try { out.position = segment?.position ? JSON.parse(JSON.stringify(segment.position)) : null; } catch (e) { out.position = String(segment?.position); }
    try { out.sourcePosition = segment?.sourcePosition ? JSON.parse(JSON.stringify(segment.sourcePosition)) : null; } catch (e) { out.sourcePosition = String(segment?.sourcePosition); }
    return out;
  };
  const timestampView = (source, timestamps) => {
    if (!timestamps) return null;
    const out = [];
    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      out.push({
        start: timestamp.start,
        end: timestamp.end,
        charStart: timestamp.charStart,
        charEnd: timestamp.charEnd,
        sourceSlice: source ? source.slice(timestamp.charStart, timestamp.charEnd) : null,
      });
    }
    return out;
  };
  const resultView = (source, result) => ({
    audioBytes: result?.audio?.size ?? null,
    error: result?.error ?? null,
    noStore: result?.noStore === true,
    marker: result?.marker ?? null,
    timestamps: timestampView(source, result?.timestamps),
  });
  try {
    await closeFixture();
    const list = Zotero.Reader._readers || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].itemID !== fixtureID) { existing = list[i]; break; }
    }
    if (!existing) throw new Error('user reader missing; refusing native stub');
    proto = Object.getPrototypeOf(existing);
    original = proto && proto._getReadAloudRemoteInterface;
    if (typeof original !== 'function') throw new Error('native prototype method missing');
    const nativeStub = {
      getVoices: async () => {
        voiceCalls.push({ method: 'getVoices' });
        return {
          voices: {
            standard: [{ id: 'stub-standard', name: 'Stub Standard' }],
            premium: [{ id: 'stub-premium', name: 'Stub Premium' }],
          },
          standardCreditsRemaining: 17,
          premiumCreditsRemaining: 23,
        };
      },
      getAudio: async (segment, voice) => {
        const snapshot = snapshotSegment(segment);
        nativeCalls.push({ voiceID: voice?.id || null, segment: snapshot });
        if (segment === 'sample') return { audio: new Blob(['native-sample'], { type: 'audio/mpeg' }), marker: 'sample-unchanged' };
        if (segment?.text === 'Error') return { audio: null, error: 'native-network', noStore: true };
        const text = segment?.text || '';
        let timestamps = [];
        if (text === 'Hello World') timestamps = [
          { start: 0, end: 0.4, charStart: 0, charEnd: 5 },
          { start: 0.4, end: 0.8, charStart: 6, charEnd: 11 },
        ];
        else if (text === '“World!”') timestamps = [{ start: 0, end: 0.6, charStart: 1, charEnd: 6 }];
        return { audio: new Blob(['native-segment'], { type: 'audio/mpeg' }), marker: 'native-prepared', timestamps };
      },
      getCreditsRemaining: async () => ({ standardCreditsRemaining: 17, premiumCreditsRemaining: 23 }),
      resetCredits: async () => ({ standardCreditsRemaining: 17, premiumCreditsRemaining: 23 }),
    };
    proto._getReadAloudRemoteInterface = function() { return nativeStub; };
    Zotero.Reader.open(fixtureID);
    for (let i = 0; i < 80; i++) {
      const now = Zotero.Reader._readers || [];
      for (let j = 0; j < now.length; j++) {
        const candidate = now[j];
        const manager = candidate._internalReader && candidate._internalReader._readAloudManager;
        if (candidate.itemID === fixtureID && manager && manager._options?.remoteInterface) { targetReader = candidate; break; }
      }
      if (targetReader) break;
      await wait(100);
    }
    if (!targetReader) throw new Error('fixture reader did not initialize');
    const manager = targetReader._internalReader._readAloudManager;
    const iface = manager._options.remoteInterface;
    const voices = await iface.getVoices();
    voicesSummary = {
      tiers: Object.keys(voices.voices || {}).map(tier => ({ tier, count: voices.voices[tier]?.length || 0 })),
      standardCredits: voices.standardCreditsRemaining,
      premiumCredits: voices.premiumCreditsRemaining,
    };
    const standardSource = '<Hello> [World]';
    const premiumSource = '“<World>!”';
    const standardSegment = Object.freeze({
      text: standardSource,
      lang: 'en',
      paragraphStart: true,
      position: { start: [0, 0, 0], end: [0, 0, standardSource.length] },
      sourcePosition: { type: 'FragmentSelector', value: 'issue-101-native-standard' },
    });
    const premiumSegment = Object.freeze({
      text: premiumSource,
      lang: 'en',
      paragraphStart: false,
      position: { start: [1, 0, 0], end: [1, 0, premiumSource.length] },
      sourcePosition: { type: 'FragmentSelector', value: 'issue-101-native-premium' },
    });
    const standardBefore = JSON.stringify(standardSegment);
    const premiumBefore = JSON.stringify(premiumSegment);
    const standard = await iface.getAudio(standardSegment, { id: 'stub-standard' });
    const premium = await iface.getAudio(premiumSegment, { id: 'stub-premium' });
    const sample = await iface.getAudio('sample', { id: 'stub-standard' });
    const failure = await iface.getAudio({ text: '<Error>', lang: 'en' }, { id: 'stub-premium' });
    results = {
      standard: { ...resultView(standardSource, standard), sourceUnchanged: JSON.stringify(standardSegment) === standardBefore, segmentTextAfter: standardSegment.text },
      premium: { ...resultView(premiumSource, premium), sourceUnchanged: JSON.stringify(premiumSegment) === premiumBefore, segmentTextAfter: premiumSegment.text },
      sample: resultView(null, sample),
      error: resultView('<Error>', failure),
    };
  } catch (e) {
    errors.push(String(e));
  } finally {
    if (proto && original) {
      try { proto._getReadAloudRemoteInterface = original; patchRestored = proto._getReadAloudRemoteInterface === original; }
      catch (e) { errors.push('restore prototype: ' + String(e)); }
    }
    await closeFixture();
  }
  return JSON.stringify({ patchRestored, fixtureClosed, voiceCalls, nativeCalls, voicesSummary, results, errors }, null, 1);
})()
