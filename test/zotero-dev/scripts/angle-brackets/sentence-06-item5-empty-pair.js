(async () => {
  const manager = (() => {
    const fixtureID = Zotero.ZoteroTTSRun.state.fixtureItemID;
    const list = Zotero.Reader._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) return list[i]._internalReader?._readAloudManager;
    return null;
  })();
  const iface = manager?._options?.remoteInterface;
  const voiceID = Zotero.ZoteroTTSRun.state.voiceID;
  const segment = Zotero.ZoteroTTSRun.state.segments?.empty;
  const before = Zotero.ZoteroTTSRun.state.segmentShapesBefore?.empty;
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
  let result = null, error = null;
  try {
    Zotero.Prefs.set('zotero-tts.cacheAudio', false);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    if (!iface || !voiceID || !segment) throw new Error('fixture remote interface, voice or segment missing');
    const audio = await iface.getAudio(segment, { id: voiceID });
    result = {
      audioBytes: audio.audio?.size ?? null,
      error: audio.error ?? null,
      timestamps: audio.timestamps ? Array.from(audio.timestamps, t => ({ start: t.start, end: t.end, charStart: t.charStart, charEnd: t.charEnd })) : null,
    };
  } catch (e) { error = { message: String(e), stack: e?.stack || null }; }
  finally {
    sandbox.fetch = originalFetch;
    if (saved.cacheAudio.user) Zotero.Prefs.set('zotero-tts.cacheAudio', saved.cacheAudio.value); else Services.prefs.clearUserPref(prefix + 'cacheAudio');
    if (saved.prefetchEnabled.user) Zotero.Prefs.set('zotero-tts.prefetchEnabled', saved.prefetchEnabled.value); else Services.prefs.clearUserPref(prefix + 'prefetchEnabled');
  }
  const shape = s => ({
    text: s.text,
    position: s.position ? { start: s.position.start, end: s.position.end } : null,
    sourcePosition: s.sourcePosition ? s.sourcePosition.value : null,
    paragraphSourcePosition: s.paragraphSourcePosition ? s.paragraphSourcePosition.value : null,
  });
  const after = segment ? shape(segment) : null;
  return JSON.stringify({
    voiceID,
    calls,
    noProviderRequest: calls.length === 0,
    result,
    error,
    sourceUnchanged: JSON.stringify(before) === JSON.stringify(after),
    before,
    after,
  }, null, 1);
})()
