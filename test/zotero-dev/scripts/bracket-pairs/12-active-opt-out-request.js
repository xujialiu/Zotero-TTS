(async () => {
  const fixtureID = 24434;
  const fullCache = 'extensions.zotero.zotero-tts.cacheAudio';
  const fullPrefetch = 'extensions.zotero.zotero-tts.prefetchEnabled';
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) reader = list[i];
  const manager = reader?._internalReader?._readAloudManager;
  const iface = manager?._options?.remoteInterface;
  const voiceID = manager?.selectedVoiceID;
  const source = '<Hello> [World]';
  const calls = [];
  let result = null;
  let error = null;
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  const cacheBefore = { value: !!Zotero.Prefs.get('zotero-tts.cacheAudio'), user: Services.prefs.prefHasUserValue(fullCache) };
  const prefetchBefore = { value: !!Zotero.Prefs.get('zotero-tts.prefetchEnabled'), user: Services.prefs.prefHasUserValue(fullPrefetch) };
  const readSettings = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.textSettings());
  sandbox.fetch = function(input, init) {
    let body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) {}
    const raw = String(input);
    calls.push({
      path: raw.replace(/^https?:\/\/[^/]+/, ''),
      method: init?.method || 'GET',
      text: typeof body?.text === 'string' ? body.text : null,
      input: typeof body?.input === 'string' ? body.input : null,
      format: typeof body?.format === 'string' ? body.format : null,
      referenceID: typeof body?.reference_id === 'string' ? body.reference_id : null,
    });
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };
  try {
    Zotero.Prefs.set('zotero-tts.readAloud.stripAngleBrackets', false);
    Zotero.Prefs.set('zotero-tts.cacheAudio', false);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    const settings = readSettings();
    if (!iface || !voiceID) throw new Error('fixture remote interface or voice missing');
    const audio = await iface.getAudio(Object.freeze({ text: source, lang: 'en' }), { id: voiceID });
    result = {
      audioBytes: audio.audio?.size ?? null,
      error: audio.error ?? null,
      timestamps: audio.timestamps ? Array.from(audio.timestamps, timestamp => ({
        charStart: timestamp.charStart,
        charEnd: timestamp.charEnd,
        sourceSlice: source.slice(timestamp.charStart, timestamp.charEnd),
      })) : null,
    };
    return JSON.stringify({ settings, source, calls, result }, null, 1);
  } catch (e) {
    error = { message: String(e), stack: e?.stack || null };
  } finally {
    sandbox.fetch = originalFetch;
    if (cacheBefore.user) Zotero.Prefs.set('zotero-tts.cacheAudio', cacheBefore.value); else Services.prefs.clearUserPref(fullCache);
    if (prefetchBefore.user) Zotero.Prefs.set('zotero-tts.prefetchEnabled', prefetchBefore.value); else Services.prefs.clearUserPref(fullPrefetch);
  }
  return JSON.stringify({ source, calls, result, error }, null, 1);
})()
