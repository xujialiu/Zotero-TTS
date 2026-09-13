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
  const controller = manager?._controller;
  const iface = manager?._options?.remoteInterface;
  const anchor = '<Prefetch anchor> <with two groups>';
  const next = '<Prefetch next> <sentence.>';
  const oldSegments = controller?._segments;
  const oldCurrent = controller?._currentIndex;
  const oldPosition = controller?._position;
  const calls = [];
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  sandbox.fetch = function(input, init) {
    let body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) {}
    calls.push({ path: String(input).replace(/^https?:\/\/[^/]+/, ''), input: body?.input ?? null });
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };
  let first = null;
  let second = null;
  let error = null;
  try {
    Zotero.Prefs.set('zotero-tts.cacheAudio', true);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', true);
    controller._segments = [{ text: anchor }, { text: next }];
    controller._currentIndex = 0;
    controller._position = 0;
    first = await iface.getAudio(Object.freeze({ text: anchor, lang: 'en' }), { id: manager.selectedVoiceID });
    for (let i = 0; i < 50 && !calls.some(call => call.input === 'Prefetch next sentence.'); i++) await new Promise(resolve => setTimeout(resolve, 100));
    second = await iface.getAudio(Object.freeze({ text: next, lang: 'en' }), { id: manager.selectedVoiceID });
  } catch (e) { error = String(e); }
  finally {
    sandbox.fetch = originalFetch;
    if (controller) { controller._segments = oldSegments; controller._currentIndex = oldCurrent; controller._position = oldPosition; }
    for (const suffix of Object.keys(saved)) {
      const full = prefix + suffix;
      if (saved[suffix].user) Zotero.Prefs.set('zotero-tts.' + suffix, saved[suffix].value);
      else Services.prefs.clearUserPref(full);
    }
  }
  const view = (source, result) => result ? { audioBytes: result.audio?.size ?? null, error: result.error ?? null,
    timestamps: result.timestamps ? Array.from(result.timestamps, timestamp => ({
      charStart: timestamp.charStart, charEnd: timestamp.charEnd, sourceSlice: source.slice(timestamp.charStart, timestamp.charEnd),
    })) : null } : null;
  return JSON.stringify({ anchor, next, calls, first: view(anchor, first), second: view(next, second),
    restoredSegments: controller?._segments === oldSegments, restoredPosition: controller?._position === oldPosition, error }, null, 1);
})()
