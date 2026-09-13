(async () => {
  const itemID = 24424;
  const voiceID = 'fish::en/9fa4b7a1b67446b48208f2f5d4bcd8da';
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === itemID) { reader = list[i]; break; }
  const manager = reader && reader._internalReader && reader._internalReader._readAloudManager;
  const iface = manager && manager._options && manager._options.remoteInterface;
  if (!reader || !manager || !iface) return JSON.stringify({ error: 'fixture remote interface missing' });
  const prefKeys = ['cacheAudio', 'prefetchEnabled'];
  const prefix = 'extensions.zotero.zotero-tts.';
  const prefSnap = {};
  for (const suffix of prefKeys) prefSnap[suffix] = {
    value: Zotero.Prefs.get('zotero-tts.' + suffix),
    user: Services.prefs.prefHasUserValue(prefix + suffix)
  };
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  const calls = [];
  const results = [];
  sandbox.fetch = function(input, init) {
    let body = null;
    try {
      if (typeof init?.body === 'string') {
        const parsed = JSON.parse(init.body);
        body = {
          text: parsed.text,
          format: parsed.format,
          mp3_bitrate: parsed.mp3_bitrate,
          latency: parsed.latency,
          reference_id: parsed.reference_id ?? null
        };
      }
    } catch (e) { body = { parseError: String(e) }; }
    let path = String(input), marker = path.indexOf('://');
    if (marker >= 0) { const slash = path.indexOf('/', marker + 3); if (slash >= 0) path = path.slice(slash); }
    calls.push({ path, method: init?.method || 'GET', body, model: init?.headers?.model || null });
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };
  const specs = [
    { name: '100-exp', source: '< 100 exp>', locale: 'en-US' },
    { name: '2-50-hp', source: '< 2/50 HP >', locale: 'en-US' },
    { name: 'four-words', source: '<One two three four>', locale: 'en-US' },
    { name: 'empty', source: '<>', locale: 'en-US' }
  ];
  try {
    Zotero.Prefs.set('zotero-tts.cacheAudio', false);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    for (const spec of specs) {
      const segment = Object.freeze({ text: spec.source, sourcePosition: { type: 'FragmentSelector', value: 'fixture-' + spec.name } });
      const result = await iface.getAudio(segment, { id: voiceID, locale: spec.locale });
      const ts = [];
      const arr = result?.timestamps || [];
      for (let j = 0; j < arr.length; j++) {
        const t = arr[j];
        ts.push({ start: t.start, end: t.end, charStart: t.charStart, charEnd: t.charEnd, sourceSlice: spec.source.slice(t.charStart, t.charEnd) });
      }
      results.push({ name: spec.name, source: spec.source, locale: spec.locale, audioBytes: result?.audio?.size ?? null, timestamps: ts, error: result?.error ?? null });
    }
  } catch (e) { results.push({ error: String(e), stack: e?.stack || null }); }
  finally {
    sandbox.fetch = originalFetch;
    for (const suffix of prefKeys) {
      const s = prefSnap[suffix];
      if (s.user) Zotero.Prefs.set('zotero-tts.' + suffix, s.value);
      else Services.prefs.clearUserPref(prefix + suffix);
    }
  }
  return JSON.stringify({ voiceID, requestedVoiceLocale: 'en-US', calls, results,
    prefsRestored: prefKeys.every(s => Zotero.Prefs.get('zotero-tts.' + s) === prefSnap[s].value && Services.prefs.prefHasUserValue(prefix + s) === prefSnap[s].user) }, null, 1);
})()
