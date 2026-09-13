(async () => {
  const baselineMemory = '{"speed":1.3,"voice":{"id":"fish::en/9fa4b7a1b67446b48208f2f5d4bcd8da","lang":"en"}}';
  let fixtureID = null;
  let targetReader = null;
  let proto = null;
  let original = null;
  let patchRestored = false;
  const nativeCalls = [];
  const result = { errors: [] };
  try {
    const imported = await Zotero.Attachments.importFromFile({
      file: '/Users/xujialiu/Works/Zotero-TTS/test/fixtures/angle-brackets/angle-brackets.epub',
      libraryID: Zotero.Libraries.userLibraryID,
      title: 'Zotero-TTS issue #98 language hint fixture 2026-09-13 native'
    });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    fixtureID = item?.id ?? imported?.id ?? imported;
    result.import = { itemID: fixtureID, title: item?.getField?.('title') ?? null };
    const readers = Zotero.Reader._readers || [];
    let existing = null;
    for (let i = 0; i < readers.length; i++) if (readers[i].itemID !== fixtureID) { existing = readers[i]; break; }
    if (!existing) throw new Error('user reader missing; refusing native stub');
    proto = Object.getPrototypeOf(existing);
    original = proto && proto._getReadAloudRemoteInterface;
    if (typeof original !== 'function') throw new Error('native prototype method missing');
    const audioBytes = await IOUtils.read('/Users/xujialiu/Works/Zotero-TTS/.tmp/fish-locale-test/baseline-100-exp.mp3');
    const nativeStub = {
      getVoices: async () => ({ voices: { standard: [{ id: 'stub-standard', name: 'Stub Standard' }], premium: [] }, standardCreditsRemaining: null, premiumCreditsRemaining: null }),
      getAudio: async (segment, voice) => {
        const isSample = segment === 'sample';
        nativeCalls.push({ kind: isSample ? 'sample' : 'segment', text: isSample ? null : segment?.text ?? null, voiceID: voice?.id ?? null, locale: voice?.locale ?? null });
        const blob = new targetReader._window.Blob([audioBytes], { type: 'audio/mpeg' });
        if (isSample) return { audio: blob, marker: 'native-sample' };
        return { audio: blob, marker: 'native-segment', timestamps: [{ start: 0, end: 0.2, charStart: 0, charEnd: 3 }] };
      },
      getCreditsRemaining: async () => ({ standardCreditsRemaining: null, premiumCreditsRemaining: null }),
      resetCredits: async () => ({ standardCreditsRemaining: null, premiumCreditsRemaining: null })
    };
    proto._getReadAloudRemoteInterface = () => nativeStub;
    Zotero.Reader.open(fixtureID);
    for (let i = 0; i < 70; i++) {
      const list = Zotero.Reader._readers || [];
      for (let j = 0; j < list.length; j++) if (list[j].itemID === fixtureID && list[j]._internalReader?._readAloudManager?._options?.remoteInterface) { targetReader = list[j]; break; }
      if (targetReader) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!targetReader) throw new Error('fixture reader did not initialize');
    const iface = targetReader._internalReader._readAloudManager._options.remoteInterface;
    const source = { text: '<100 exp>', sourcePosition: { type: 'FragmentSelector', value: 'native-test' } };
    const response = await iface.getAudio(source, { id: 'stub-native', locale: 'en-US' });
    const timestamps = [];
    for (const t of (response.timestamps || [])) timestamps.push({ start: t.start, end: t.end, charStart: t.charStart, charEnd: t.charEnd, sourceSlice: source.text.slice(t.charStart, t.charEnd) });
    const sample = await iface.getAudio('sample', { id: 'stub-native', locale: 'en-US' });
    result.response = { audioBytes: response.audio?.size ?? null, error: response.error ?? null, timestamps };
    result.sample = { audioBytes: sample.audio?.size ?? null, error: sample.error ?? null };
  } catch (e) {
    result.error = { message: String(e), stack: e?.stack || null };
  } finally {
    if (proto && original) {
      try { proto._getReadAloudRemoteInterface = original; patchRestored = proto._getReadAloudRemoteInterface === original; }
      catch (e) { result.errors.push('restore prototype: ' + String(e)); }
    }
    if (targetReader) {
      try { targetReader._internalReader?.toggleReadAloudPopup(false); } catch (e) { result.errors.push('toggle: ' + String(e)); }
      await new Promise(resolve => setTimeout(resolve, 500));
      try { const p = targetReader.close(); if (p && typeof p.then === 'function') await p; result.closed = true; } catch (e) { result.errors.push('close: ' + String(e)); }
    }
    if (fixtureID !== null) {
      for (let i = 0; i < 40; i++) {
        let found = false;
        const list = Zotero.Reader._readers || [];
        for (let j = 0; j < list.length; j++) if (list[j].itemID === fixtureID) { found = true; break; }
        if (!found) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      try { const item = Zotero.Items.get(fixtureID); if (item) { await item.eraseTx(); result.erased = true; } } catch (e) { result.errors.push('erase: ' + String(e)); }
    }
    if (Zotero.Prefs.get('zotero-tts.readAloud.memory') !== baselineMemory) Zotero.Prefs.set('zotero-tts.readAloud.memory', baselineMemory);
  }
  result.patchRestored = patchRestored;
  result.nativeCalls = nativeCalls;
  result.user = [];
  const now = Zotero.Reader._readers || [];
  for (let i = 0; i < now.length; i++) {
    const r = now[i], m = r._internalReader && r._internalReader._readAloudManager, c = m && m._controller;
    result.user.push({ itemID: r.itemID, active: !!m?.active, paused: m ? !!m.paused : null, voice: m?.selectedVoiceID ?? null, position: c?._position ?? null, error: c?._lastError ?? null });
  }
  let remaining = 0;
  for (let i = 0; i < now.length; i++) if (now[i].itemID === fixtureID) remaining++;
  result.remainingFixtureReaders = remaining;
  return JSON.stringify(result, null, 1);
})()
