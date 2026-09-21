(async () => {
  const manager = (() => {
    const fixtureID = Zotero.ZoteroTTSRun.state.fixtureItemID;
    const list = Zotero.Reader._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) return list[i]._internalReader?._readAloudManager;
    return null;
  })();
  const iface = manager?._options?.remoteInterface;
  const voiceID = Zotero.ZoteroTTSRun.state.voiceID;
  const prefix = 'extensions.zotero.zotero-tts.';
  const saved = {};
  for (const suffix of ['cacheAudio', 'prefetchEnabled']) saved[suffix] = {
    value: !!Zotero.Prefs.get('zotero-tts.' + suffix), user: Services.prefs.prefHasUserValue(prefix + suffix),
  };
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  let currentCalls = [];
  sandbox.fetch = function (input, init) {
    let body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) {}
    currentCalls.push({
      path: String(input).replace(/^https?:\/\/[^/]+/, ''),
      model: init?.headers?.model ?? null,
      text: typeof body?.text === 'string' ? body.text : null,
    });
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };

  async function capture(key, expectedText) {
    const segment = Zotero.ZoteroTTSRun.state.segments?.[key];
    currentCalls = [];
    const debugBefore = Zotero.Debug.storing ? await Zotero.Debug.get() : '';
    let audio = null, error = null;
    try {
      audio = await iface.getAudio(segment, { id: voiceID });
    } catch (e) { error = { message: String(e), stack: e?.stack || null }; }
    const debugAfter = Zotero.Debug.storing ? await Zotero.Debug.get() : '';
    const debugAdded = debugAfter.length >= debugBefore.length ? debugAfter.slice(debugBefore.length) : debugAfter;
    const original = segment.text;
    const ranges = audio && audio.timestamps
      ? Array.from(audio.timestamps, t => ({ start: t.start, end: t.end, charStart: t.charStart, charEnd: t.charEnd, slice: original.slice(t.charStart, t.charEnd) }))
      : [];
    let everyRangeSlicesWord = ranges.length > 0;
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      if (!(r.charEnd > r.charStart) || !r.slice.trim().length || /[\[\]]/.test(r.slice)) everyRangeSlicesWord = false;
    }
    return {
      requestText: currentCalls[0]?.text ?? null,
      requestMatchesExpected: currentCalls[0]?.text === expectedText,
      model: currentCalls[0]?.model ?? null,
      callCount: currentCalls.length,
      audioBytes: audio?.audio?.size ?? null,
      audioError: audio?.error ?? null,
      error,
      rangeCount: ranges.length,
      ranges,
      everyRangeSlicesWord,
      debugLineNew: debugAdded.indexOf('[zotero-tts] bracket pairs:') !== -1 ? debugAdded.split('\n').filter(l => l.indexOf('bracket pairs:') !== -1) : [],
    };
  }

  let fireball = null, levelUp = null, fatal = null;
  try {
    // Cache ON: these two sentences are new to #127 and have never been
    // requested with this voice before, so this is still a guaranteed
    // fresh miss -- and it leaves Fireball's entry in the cache for
    // sentence-09's repeat-through-the-cache check.
    Zotero.Prefs.set('zotero-tts.cacheAudio', true);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    if (!iface || !voiceID) throw new Error('fixture remote interface or voice missing');
    if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
    fireball = await capture('fireball', 'He cast Fireball at the wolf.');
    levelUp = await capture('levelUp', 'Level Up You gained 100 exp.');
  } catch (e) { fatal = { message: String(e), stack: e?.stack || null }; }
  finally {
    sandbox.fetch = originalFetch;
    if (saved.cacheAudio.user) Zotero.Prefs.set('zotero-tts.cacheAudio', saved.cacheAudio.value); else Services.prefs.clearUserPref(prefix + 'cacheAudio');
    if (saved.prefetchEnabled.user) Zotero.Prefs.set('zotero-tts.prefetchEnabled', saved.prefetchEnabled.value); else Services.prefs.clearUserPref(prefix + 'prefetchEnabled');
  }

  const fireballSlice = fireball ? fireball.ranges.find(r => r.slice === 'Fireball') : null;
  const levelRange = levelUp ? levelUp.ranges.find(r => r.slice === 'Level') : null;
  const upRange = levelUp ? levelUp.ranges.find(r => r.slice === 'Up') : null;

  return JSON.stringify({
    voiceID,
    fireball: fireball ? {
      requestText: fireball.requestText, requestMatchesExpected: fireball.requestMatchesExpected, model: fireball.model,
      callCount: fireball.callCount, everyRangeSlicesWord: fireball.everyRangeSlicesWord, rangeCount: fireball.rangeCount,
      fireballSlice: fireballSlice ? { charStart: fireballSlice.charStart, charEnd: fireballSlice.charEnd, endAfterStart: fireballSlice.charEnd > fireballSlice.charStart } : null,
      fireballSliceMatchesExpected: !!fireballSlice && fireballSlice.charStart === 9 && fireballSlice.charEnd === 17,
      debugLineNew: fireball.debugLineNew, audioError: fireball.audioError, error: fireball.error,
    } : null,
    levelUp: levelUp ? {
      requestText: levelUp.requestText, requestMatchesExpected: levelUp.requestMatchesExpected, model: levelUp.model,
      callCount: levelUp.callCount, everyRangeSlicesWord: levelUp.everyRangeSlicesWord, rangeCount: levelUp.rangeCount,
      levelRange: levelRange ? { charStart: levelRange.charStart, charEnd: levelRange.charEnd } : null,
      levelRangeMatchesExpected: !!levelRange && levelRange.charStart === 1 && levelRange.charEnd === 6,
      upRange: upRange ? { charStart: upRange.charStart, charEnd: upRange.charEnd } : null,
      upRangeMatchesExpected: !!upRange && upRange.charStart === 7 && upRange.charEnd === 9,
      debugLineNew: levelUp.debugLineNew, audioError: levelUp.audioError, error: levelUp.error,
    } : null,
    fatal,
  }, null, 1);
})()
