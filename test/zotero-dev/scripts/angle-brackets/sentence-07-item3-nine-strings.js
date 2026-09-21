(async () => {
  // Case items 8/9's changed expectations (#127), text only: a fetch wrapper
  // that blocks before the network is enough (no synthesis needed) since
  // only the prepared request text is being proven here.
  const manager = (() => {
    const fixtureID = Zotero.ZoteroTTSRun.state.fixtureItemID;
    const list = Zotero.Reader._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) return list[i]._internalReader?._readAloudManager;
    return null;
  })();
  const iface = manager?._options?.remoteInterface;
  const voiceID = Zotero.ZoteroTTSRun.state.voiceID;
  const cases = [
    ['<<A>> <B>', 'A B'],
    ['<A> <B', 'A <B'],
    ['<A>> <B>', 'A> B'],
    ['<A> and <B>', 'A and B'],
    ['a < b > c', 'a < b > c'],
    ['<[Hello]> [<World>]', 'Hello World'],
    ['<[Hello>]', 'Hello'],
    ['x <= 5 and y >= 3', 'x <= 5 and y >= 3'],
    ['<Warning: HP < 10%>', 'Warning: HP < 10%'],
  ];
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
    return Promise.reject(new Error('zotero-tester: request blocked before the network (issue #127 text-only probe)'));
  };
  const results = [];
  let fatal = null;
  try {
    Zotero.Prefs.set('zotero-tts.cacheAudio', false);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    if (!iface || !voiceID) throw new Error('fixture remote interface or voice missing');
    for (let i = 0; i < cases.length; i++) {
      const [input, expected] = cases[i];
      currentCalls = [];
      const segment = Object.freeze({
        text: input, lang: 'en', paragraphStart: true,
        position: { start: [0, 0, 0], end: [0, 0, input.length] },
        sourcePosition: { type: 'FragmentSelector', value: 'issue-127-nine-' + i },
      });
      let audio = null, error = null;
      try { audio = await iface.getAudio(segment, { id: voiceID }); } catch (e) { error = String(e); }
      const requestText = currentCalls[0]?.text ?? null;
      results.push({
        input, expected, requestText, matches: requestText === expected,
        callCount: currentCalls.length, audioError: audio?.error ?? null, error,
      });
    }
  } catch (e) { fatal = { message: String(e), stack: e?.stack || null }; }
  finally {
    sandbox.fetch = originalFetch;
    if (saved.cacheAudio.user) Zotero.Prefs.set('zotero-tts.cacheAudio', saved.cacheAudio.value); else Services.prefs.clearUserPref(prefix + 'cacheAudio');
    if (saved.prefetchEnabled.user) Zotero.Prefs.set('zotero-tts.prefetchEnabled', saved.prefetchEnabled.value); else Services.prefs.clearUserPref(prefix + 'prefetchEnabled');
  }
  const allMatch = results.length === cases.length && results.every(r => r.matches);
  return JSON.stringify({ voiceID, allMatch, results, fatal }, null, 1);
})()
