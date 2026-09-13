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
  const source = '<Hello> [World]';
  const calls = [];
  const before = {
    cache: { value: !!Zotero.Prefs.get('zotero-tts.cacheAudio'), user: Services.prefs.prefHasUserValue(cacheKey) },
    prefetch: { value: !!Zotero.Prefs.get('zotero-tts.prefetchEnabled'), user: Services.prefs.prefHasUserValue(prefetchKey) },
  };
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
      format: typeof body?.format === 'string' ? body.format : null,
      referenceID: typeof body?.reference_id === 'string' ? body.reference_id : null,
    });
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };
  let result = null;
  let error = null;
  const segment = Object.freeze({
    text: source,
    lang: 'en',
    paragraphStart: true,
    position: { start: [0, 0, 0], end: [0, 0, source.length] },
    sourcePosition: { type: 'FragmentSelector', value: 'issue-101-default' },
  });
  const originalSegment = JSON.stringify(segment);
  try {
    Zotero.Prefs.set('zotero-tts.cacheAudio', false);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    if (!iface || !voiceID) throw new Error('fixture remote interface or voice missing');
    const audio = await iface.getAudio(segment, { id: voiceID });
    result = {
      audioBytes: audio.audio?.size ?? null,
      error: audio.error ?? null,
      timestamps: audio.timestamps ? Array.from(audio.timestamps, timestamp => ({
        start: timestamp.start,
        end: timestamp.end,
        charStart: timestamp.charStart,
        charEnd: timestamp.charEnd,
        sourceSlice: source.slice(timestamp.charStart, timestamp.charEnd),
      })) : null,
      sourceUnchanged: JSON.stringify(segment) === originalSegment,
      segmentTextAfter: segment.text,
    };
  } catch (e) { error = { message: String(e), stack: e?.stack || null }; }
  finally {
    sandbox.fetch = originalFetch;
    if (before.cache.user) Zotero.Prefs.set('zotero-tts.cacheAudio', before.cache.value); else Services.prefs.clearUserPref(cacheKey);
    if (before.prefetch.user) Zotero.Prefs.set('zotero-tts.prefetchEnabled', before.prefetch.value); else Services.prefs.clearUserPref(prefetchKey);
  }
  return JSON.stringify({ source, voiceID, calls, result, error }, null, 1);
})()
