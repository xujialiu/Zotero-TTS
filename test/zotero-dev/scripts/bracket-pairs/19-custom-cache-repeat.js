(async () => {
  const fixtureID = 24434;
  const cacheKey = 'extensions.zotero.zotero-tts.cacheAudio';
  const prefetchKey = 'extensions.zotero.zotero-tts.prefetchEnabled';
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) reader = list[i];
  const manager = reader?._internalReader?._readAloudManager;
  const iface = manager?._options?.remoteInterface;
  const voiceID = manager?.selectedVoiceID;
  const source = '【Hello】 (World)';
  const calls = [];
  const results = [];
  const cacheBefore = { value: !!Zotero.Prefs.get('zotero-tts.cacheAudio'), user: Services.prefs.prefHasUserValue(cacheKey) };
  const prefetchBefore = { value: !!Zotero.Prefs.get('zotero-tts.prefetchEnabled'), user: Services.prefs.prefHasUserValue(prefetchKey) };
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  sandbox.fetch = function(input, init) {
    let body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) {}
    calls.push({
      path: String(input).replace(/^https?:\/\/[^/]+/, ''),
      method: init?.method || 'GET',
      text: typeof body?.text === 'string' ? body.text : null,
      input: typeof body?.input === 'string' ? body.input : null,
    });
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };
  let error = null;
  try {
    Zotero.Prefs.set('zotero-tts.cacheAudio', true);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    if (!iface || !voiceID) throw new Error('fixture remote interface or voice missing');
    for (let i = 0; i < 2; i++) {
      const audio = await iface.getAudio(Object.freeze({ text: source, lang: 'en' }), { id: voiceID });
      results.push({
        audioBytes: audio.audio?.size ?? null,
        error: audio.error ?? null,
        timestamps: audio.timestamps ? Array.from(audio.timestamps, timestamp => ({
          start: timestamp.start,
          end: timestamp.end,
          charStart: timestamp.charStart,
          charEnd: timestamp.charEnd,
          sourceSlice: source.slice(timestamp.charStart, timestamp.charEnd),
        })) : null,
      });
    }
  } catch (e) { error = { message: String(e), stack: e?.stack || null }; }
  finally {
    sandbox.fetch = originalFetch;
    if (cacheBefore.user) Zotero.Prefs.set('zotero-tts.cacheAudio', cacheBefore.value); else Services.prefs.clearUserPref(cacheKey);
    if (prefetchBefore.user) Zotero.Prefs.set('zotero-tts.prefetchEnabled', prefetchBefore.value); else Services.prefs.clearUserPref(prefetchKey);
  }
  return JSON.stringify({ source, configuredPairs: Zotero.Prefs.get('zotero-tts.readAloud.bracketPairs'), calls, callCount: calls.length, results, sameTimestamps: JSON.stringify(results[0]?.timestamps) === JSON.stringify(results[1]?.timestamps), error }, null, 1);
})()
