(async () => {
  const fixtureID = Zotero.ZoteroTTSRun.state.fixtureItemID;
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) reader = list[i];
  const manager = reader?._internalReader?._readAloudManager;
  const iface = manager?._options?.remoteInterface;
  const voiceID = Zotero.ZoteroTTSRun.state.voiceID;
  const segment = Zotero.ZoteroTTSRun.state.segments?.fox;
  const before = Zotero.ZoteroTTSRun.state.segmentShapesBefore?.fox;
  const shape = s => ({
    text: s.text,
    position: s.position ? { start: s.position.start, end: s.position.end } : null,
    sourcePosition: s.sourcePosition ? s.sourcePosition.value : null,
    paragraphSourcePosition: s.paragraphSourcePosition ? s.paragraphSourcePosition.value : null,
  });
  const prefix = 'extensions.zotero.zotero-tts.';
  const saved = {};
  for (const suffix of ['cacheAudio', 'prefetchEnabled']) saved[suffix] = {
    value: !!Zotero.Prefs.get('zotero-tts.' + suffix), user: Services.prefs.prefHasUserValue(prefix + suffix),
  };
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  const calls = [];
  sandbox.fetch = function (input, init) {
    let body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) {}
    calls.push({
      path: String(input).replace(/^https?:\/\/[^/]+/, ''),
      model: init?.headers?.model ?? null,
      text: typeof body?.text === 'string' ? body.text : null,
    });
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
      timestampCount: audio.timestamps ? audio.timestamps.length : null,
    };
  } catch (e) { error = { message: String(e), stack: e?.stack || null }; }
  finally {
    sandbox.fetch = originalFetch;
    if (saved.cacheAudio.user) Zotero.Prefs.set('zotero-tts.cacheAudio', saved.cacheAudio.value); else Services.prefs.clearUserPref(prefix + 'cacheAudio');
    if (saved.prefetchEnabled.user) Zotero.Prefs.set('zotero-tts.prefetchEnabled', saved.prefetchEnabled.value); else Services.prefs.clearUserPref(prefix + 'prefetchEnabled');
  }
  const after = segment ? shape(segment) : null;
  const expectedText = '“The quick brown fox jumps over the lazy dog!”';
  const requestText = calls[0]?.text ?? null;
  return JSON.stringify({
    voiceID,
    calls,
    requestText,
    requestMatchesExpected: requestText === expectedText,
    requestEndsWithExpected: typeof requestText === 'string' && requestText.endsWith(expectedText),
    result,
    error,
    sourceUnchanged: JSON.stringify(before) === JSON.stringify(after),
    before,
    after,
  }, null, 1);
})()
