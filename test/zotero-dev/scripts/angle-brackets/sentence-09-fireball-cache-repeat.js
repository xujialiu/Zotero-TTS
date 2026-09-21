(async () => {
  const manager = (() => {
    const fixtureID = Zotero.ZoteroTTSRun.state.fixtureItemID;
    const list = Zotero.Reader._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) return list[i]._internalReader?._readAloudManager;
    return null;
  })();
  const iface = manager?._options?.remoteInterface;
  const voiceID = Zotero.ZoteroTTSRun.state.voiceID;
  const segment = Zotero.ZoteroTTSRun.state.segments?.fireball;
  const prefix = 'extensions.zotero.zotero-tts.';
  const saved = {};
  for (const suffix of ['cacheAudio', 'prefetchEnabled']) saved[suffix] = {
    value: !!Zotero.Prefs.get('zotero-tts.' + suffix), user: Services.prefs.prefHasUserValue(prefix + suffix),
  };
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  const calls = [];
  sandbox.fetch = function (input, init) {
    calls.push({ path: String(input).replace(/^https?:\/\/[^/]+/, '') });
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };
  let audio = null, error = null;
  try {
    // Cache back on (it was off for the fresh capture in sentence-08); prefetch stays off.
    Zotero.Prefs.set('zotero-tts.cacheAudio', true);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    if (!iface || !voiceID || !segment) throw new Error('fixture remote interface, voice or segment missing');
    audio = await iface.getAudio(segment, { id: voiceID });
  } catch (e) { error = { message: String(e), stack: e?.stack || null }; }
  finally {
    sandbox.fetch = originalFetch;
    if (saved.cacheAudio.user) Zotero.Prefs.set('zotero-tts.cacheAudio', saved.cacheAudio.value); else Services.prefs.clearUserPref(prefix + 'cacheAudio');
    if (saved.prefetchEnabled.user) Zotero.Prefs.set('zotero-tts.prefetchEnabled', saved.prefetchEnabled.value); else Services.prefs.clearUserPref(prefix + 'prefetchEnabled');
  }
  const original = segment.text;
  const ranges = audio && audio.timestamps
    ? Array.from(audio.timestamps, t => ({ charStart: t.charStart, charEnd: t.charEnd, slice: original.slice(t.charStart, t.charEnd) }))
    : [];
  const fireballSlice = ranges.find(r => r.slice === 'Fireball');
  return JSON.stringify({
    noSecondRequest: calls.length === 0,
    calls,
    audioBytes: audio?.audio?.size ?? null,
    error,
    rangeCount: ranges.length,
    ranges,
    fireballSliceSame: !!fireballSlice && fireballSlice.charStart === 9 && fireballSlice.charEnd === 17,
  }, null, 1);
})()
