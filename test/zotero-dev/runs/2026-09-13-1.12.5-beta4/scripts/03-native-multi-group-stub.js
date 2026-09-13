(async () => {
  const fixtureID = 25445;
  const source = '<Log in> <Register> <Play as guest>';
  const cleaned = 'Log in Register Play as guest';
  const words = ['Log', 'in', 'Register', 'Play', 'as', 'guest'];
  const nativeCalls = [];
  const errors = [];
  let proto = null;
  let original = null;
  let patchRestored = false;
  let fixtureClosed = false;
  let result = null;
  let voiceSummary = null;
  const closeFixture = async () => {
    const list = Zotero.Reader._readers || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].itemID !== fixtureID) continue;
      try {
        const pending = list[i].close();
        if (pending && typeof pending.then === 'function') await pending;
      } catch (e) { errors.push('close: ' + String(e)); }
    }
    for (let i = 0; i < 40; i++) {
      let found = false;
      const now = Zotero.Reader._readers || [];
      for (let j = 0; j < now.length; j++) if (now[j].itemID === fixtureID) found = true;
      if (!found) { fixtureClosed = true; return; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  const snapshotSegment = segment => {
    const copy = {
      text: segment?.text ?? null,
      lang: segment?.lang ?? null,
      paragraphStart: segment?.paragraphStart ?? null,
      position: null,
      sourcePosition: null,
    };
    try { copy.position = segment?.position ? JSON.parse(JSON.stringify(segment.position)) : null; }
    catch (e) { copy.position = String(segment?.position); }
    try { copy.sourcePosition = segment?.sourcePosition ? JSON.parse(JSON.stringify(segment.sourcePosition)) : null; }
    catch (e) { copy.sourcePosition = String(segment?.sourcePosition); }
    return copy;
  };
  try {
    await closeFixture();
    const list = Zotero.Reader._readers || [];
    let existing = null;
    for (let i = 0; i < list.length; i++) if (list[i].itemID !== fixtureID) { existing = list[i]; break; }
    if (!existing) throw new Error('user reader missing; refusing native stub');
    proto = Object.getPrototypeOf(existing);
    original = proto && proto._getReadAloudRemoteInterface;
    if (typeof original !== 'function') throw new Error('native prototype method missing');
    const nativeStub = {
      getVoices: async () => ({
        voices: { standard: [{ id: 'stub-standard', name: 'Stub Standard' }], premium: [] },
        standardCreditsRemaining: 17,
        premiumCreditsRemaining: 23,
      }),
      getAudio: async (segment, voice) => {
        nativeCalls.push({ voiceID: voice?.id || null, segment: segment === 'sample' ? { kind: 'sample' } : snapshotSegment(segment) });
        if (segment === 'sample') return { audio: new Blob(['native-multi'], { type: 'audio/mpeg' }), marker: 'sample-unchanged' };
        const timestamps = words.map((word, index) => {
          const charStart = cleaned.indexOf(word);
          return { start: index * 0.5, end: index * 0.5 + 0.4, charStart, charEnd: charStart + word.length };
        });
        return { audio: new Blob(['native-multi'], { type: 'audio/mpeg' }), timestamps, marker: 'native-multi' };
      },
      getCreditsRemaining: async () => ({ standardCreditsRemaining: 17, premiumCreditsRemaining: 23 }),
      resetCredits: async () => ({ standardCreditsRemaining: 17, premiumCreditsRemaining: 23 }),
    };
    proto._getReadAloudRemoteInterface = function() { return nativeStub; };
    Zotero.Reader.open(fixtureID);
    let reader = null;
    for (let i = 0; i < 40; i++) {
      const now = Zotero.Reader._readers || [];
      for (let j = 0; j < now.length; j++) {
        const candidate = now[j];
        const manager = candidate._internalReader && candidate._internalReader._readAloudManager;
        if (candidate.itemID === fixtureID && manager && manager._options?.remoteInterface) { reader = candidate; break; }
      }
      if (reader) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!reader) throw new Error('fixture reader did not initialize');
    const manager = reader._internalReader._readAloudManager;
    const iface = manager._options.remoteInterface;
    const voices = await iface.getVoices();
    voiceSummary = {
      standard: voices.voices?.standard?.length ?? 0,
      premium: voices.voices?.premium?.length ?? 0,
      standardCredits: voices.standardCreditsRemaining,
      premiumCredits: voices.premiumCreditsRemaining,
    };
    const segment = Object.freeze({
      text: source,
      lang: 'en',
      paragraphStart: true,
      position: { start: [0, 0, 0], end: [0, 0, source.length] },
      sourcePosition: { type: 'FragmentSelector', value: 'native-multi-position' },
    });
    const audio = await iface.getAudio(segment, { id: 'stub-standard' });
    result = {
      audioBytes: audio.audio?.size ?? null,
      error: audio.error ?? null,
      marker: audio.marker ?? null,
      timestamps: audio.timestamps ? Array.from(audio.timestamps, timestamp => ({
        start: timestamp.start,
        end: timestamp.end,
        charStart: timestamp.charStart,
        charEnd: timestamp.charEnd,
        sourceSlice: source.slice(timestamp.charStart, timestamp.charEnd),
      })) : null,
      sourceTextAfter: segment.text,
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
  return JSON.stringify({ source, cleaned, voiceSummary, nativeCalls, result, patchRestored, fixtureClosed, errors }, null, 1);
})()
