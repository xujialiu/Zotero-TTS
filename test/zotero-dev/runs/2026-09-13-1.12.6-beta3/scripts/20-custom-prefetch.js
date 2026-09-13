(async () => {
  const fixtureID = 24434;
  const prefix = 'extensions.zotero.zotero-tts.';
  const saved = {};
  for (const suffix of ['cacheAudio', 'prefetchEnabled']) saved[suffix] = {
    value: !!Zotero.Prefs.get('zotero-tts.' + suffix),
    user: Services.prefs.prefHasUserValue(prefix + suffix),
  };
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) reader = list[i];
  const manager = reader?._internalReader?._readAloudManager;
  const controller = manager?._controller;
  const iface = manager?._options?.remoteInterface;
  const voiceID = manager?.selectedVoiceID;
  const anchor = '【Prefetch anchor】 (with two groups)';
  const next = '【Prefetch next】 (sentence.)';
  const anchorPrepared = 'Prefetch anchor with two groups';
  const nextPrepared = 'Prefetch next sentence.';
  const oldSegments = controller?._segments;
  const oldCurrent = controller?._currentIndex;
  const oldPosition = controller?._position;
  const calls = [];
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
  let first = null;
  let second = null;
  let error = null;
  try {
    Zotero.Prefs.set('zotero-tts.cacheAudio', true);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', true);
    if (!controller || !iface || !voiceID) throw new Error('fixture controller, remote interface or voice missing');
    controller._segments = [{ text: anchor }, { text: next }];
    controller._currentIndex = 0;
    controller._position = 0;
    first = await iface.getAudio(Object.freeze({ text: anchor, lang: 'en' }), { id: voiceID });
    for (let i = 0; i < 50; i++) {
      let found = false;
      for (let j = 0; j < calls.length; j++) {
        if (calls[j].text === nextPrepared || calls[j].input === nextPrepared) { found = true; break; }
      }
      if (found) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const callCountBeforeSecond = calls.length;
    second = await iface.getAudio(Object.freeze({ text: next, lang: 'en' }), { id: voiceID });
    return JSON.stringify({
      configuredPairs: Zotero.Prefs.get('zotero-tts.readAloud.bracketPairs'),
      anchor,
      next,
      expectedPrepared: { anchor: anchorPrepared, next: nextPrepared },
      calls,
      callCountBeforeSecond,
      first: { audioBytes: first.audio?.size ?? null, error: first.error ?? null },
      second: { audioBytes: second.audio?.size ?? null, error: second.error ?? null },
      nextPrefetched: calls.some?.(call => call.text === nextPrepared || call.input === nextPrepared) ?? false,
      error: null,
    }, null, 1);
  } catch (e) { error = { message: String(e), stack: e?.stack || null }; }
  finally {
    sandbox.fetch = originalFetch;
    if (controller) { controller._segments = oldSegments; controller._currentIndex = oldCurrent; controller._position = oldPosition; }
    for (const suffix of Object.keys(saved)) {
      const full = prefix + suffix;
      if (saved[suffix].user) Zotero.Prefs.set('zotero-tts.' + suffix, saved[suffix].value); else Services.prefs.clearUserPref(full);
    }
  }
  return JSON.stringify({ anchor, next, calls, error, restoredSegments: controller?._segments === oldSegments, restoredPosition: controller?._position === oldPosition }, null, 1);
})()
