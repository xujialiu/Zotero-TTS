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
    currentCalls.push({ text: typeof body?.text === 'string' ? body.text : null });
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };

  async function capture(key, expectedText) {
    const segment = Zotero.ZoteroTTSRun.state.segments?.[key];
    currentCalls = [];
    const debugBefore = Zotero.Debug.storing ? await Zotero.Debug.get() : '';
    let audio = null, error = null;
    try { audio = await iface.getAudio(segment, { id: voiceID }); } catch (e) { error = { message: String(e), stack: e?.stack || null }; }
    const debugAfter = Zotero.Debug.storing ? await Zotero.Debug.get() : '';
    const debugAdded = debugAfter.length >= debugBefore.length ? debugAfter.slice(debugBefore.length) : debugAfter;
    const bracketLines = debugAdded.split('\n').filter(l => l.indexOf('[zotero-tts] bracket pairs:') !== -1);
    return {
      requestText: currentCalls[0]?.text ?? null,
      requestMatchesExpected: currentCalls[0]?.text === expectedText,
      callCount: currentCalls.length,
      audioBytes: audio?.audio?.size ?? null,
      audioError: audio?.error ?? null,
      error,
      hasBracketDebugLine: bracketLines.length > 0,
      bracketLines,
    };
  }

  let gained = null, ifx = null, fatal = null;
  try {
    Zotero.Prefs.set('zotero-tts.cacheAudio', true);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    if (!iface || !voiceID) throw new Error('fixture remote interface or voice missing');
    if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
    gained = await capture('gained', 'You gained  100 exp today.');
    ifx = await capture('ifx', 'If x < 5 and y > 3, stop.');
  } catch (e) { fatal = { message: String(e), stack: e?.stack || null }; }
  finally {
    sandbox.fetch = originalFetch;
    if (saved.cacheAudio.user) Zotero.Prefs.set('zotero-tts.cacheAudio', saved.cacheAudio.value); else Services.prefs.clearUserPref(prefix + 'cacheAudio');
    if (saved.prefetchEnabled.user) Zotero.Prefs.set('zotero-tts.prefetchEnabled', saved.prefetchEnabled.value); else Services.prefs.clearUserPref(prefix + 'prefetchEnabled');
  }
  return JSON.stringify({ voiceID, gained, ifx, fatal }, null, 1);
})()
