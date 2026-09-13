(async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const saved = {};
  for (const suffix of ['cacheAudio', 'prefetchEnabled']) saved[suffix] = {
    value: !!Zotero.Prefs.get('zotero-tts.' + suffix),
    user: Services.prefs.prefHasUserValue(prefix + suffix),
  };
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === 25444) reader = list[i];
  const manager = reader?._internalReader?._readAloudManager;
  const iface = manager?._options?.remoteInterface;
  const sources = [
    '<Log in> <Register> <Play as guest>',
    '“<A>”, <B>!',
    '<<A>> <B>',
    '<<A> <B>>',
    '<A> <B',
    '<A>> <B>',
    '<A> and <B>',
    'a < b > c',
  ];
  const expected = [
    'Log in Register Play as guest', '“A”, B!', '<A> B', '<A> <B>',
    '<A> <B', '<A>> <B>', '<A> and <B>', 'a < b > c',
  ];
  const calls = [];
  const results = [];
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  sandbox.fetch = function(input, init) {
    let body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) {}
    calls.push({ path: String(input).replace(/^https?:\/\/[^/]+/, ''), input: body?.input ?? null });
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };
  let error = null;
  try {
    Zotero.Prefs.set('zotero-tts.cacheAudio', false);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      const result = await iface.getAudio(Object.freeze({ text: source, lang: 'en' }), { id: manager.selectedVoiceID });
      results.push({ source, expected: expected[i], audioBytes: result.audio?.size ?? null, error: result.error ?? null,
        timestamps: result.timestamps ? Array.from(result.timestamps, timestamp => ({
          charStart: timestamp.charStart, charEnd: timestamp.charEnd,
          sourceSlice: source.slice(timestamp.charStart, timestamp.charEnd),
        })) : null });
    }
  } catch (e) { error = String(e); }
  finally {
    sandbox.fetch = originalFetch;
    for (const suffix of Object.keys(saved)) {
      const full = prefix + suffix;
      if (saved[suffix].user) Zotero.Prefs.set('zotero-tts.' + suffix, saved[suffix].value);
      else Services.prefs.clearUserPref(full);
    }
  }
  return JSON.stringify({ calls, results, error }, null, 1);
})()
