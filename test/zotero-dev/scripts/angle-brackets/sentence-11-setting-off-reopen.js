(async () => {
  const fixtureID = Zotero.ZoteroTTSRun.state.fixtureItemID;
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) reader = list[i];
  if (!reader) return JSON.stringify({ error: 'fixture reader missing' });
  const internal = reader._internalReader;
  const manager = internal?._readAloudManager;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = label => ({
    label, active: !!manager?.active, paused: manager ? !!manager.paused : null,
    popupOpen: !!internal?._readAloudPopupOpen, selectedVoiceID: manager?.selectedVoiceID || null,
  });
  const trace = [state('before-stop')];
  let error = null;
  try {
    Zotero.Prefs.set('zotero-tts.readAloud.stripAngleBrackets', false);
    internal.toggleReadAloudPopup(false);
    for (let i = 0; i < 30; i++) { if (!manager?.active) break; await wait(100); }
    trace.push(state('after-stop'));
    internal.toggleReadAloudPopup(true);
    for (let i = 0; i < 50; i++) { if (manager?.active && manager._controller) break; await wait(100); }
    trace.push(state('after-reopen'));
    await wait(400); // let the natural resynthesis of the resumed position actually fire
    if (manager?.active && !manager.paused) manager.pause();
    await wait(150);
    trace.push(state('paused-after-reopen'));
  } catch (e) { error = { message: String(e), stack: e?.stack || null }; }

  let textSettingsEntry = null;
  try {
    const all = JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings());
    const readers = Zotero.Reader._readers || [];
    for (let i = 0; i < readers.length; i++) if (readers[i].itemID === fixtureID) textSettingsEntry = all[i];
  } catch (e) { textSettingsEntry = { error: String(e) }; }

  // Reopening rebuilt the segments (new objects); re-anchor state on the fresh ones by index.
  const segs = (manager && manager.segments) || [];
  const refreshed = { fireball: segs[7] || null, levelUp: segs[8] || null, gained: segs[9] || null, ifx: segs[10] || null };
  const refreshedTexts = { fireball: segs[7] ? segs[7].text : null, levelUp: segs[8] ? segs[8].text : null, gained: segs[9] ? segs[9].text : null, ifx: segs[10] ? segs[10].text : null };
  Zotero.ZoteroTTSRun.state.segmentsOff = refreshed;

  const voiceID = manager ? manager.selectedVoiceID : null;
  const iface = manager?._options?.remoteInterface;
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  let currentCalls = [];
  sandbox.fetch = function (input, init) {
    let body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) {}
    currentCalls.push({ text: typeof body?.text === 'string' ? body.text : null });
    return Promise.reject(new Error('zotero-tester: request blocked before the network (issue #127 setting-off recheck)'));
  };
  const expectedRaw = {
    fireball: 'He cast [Fireball] at the wolf.',
    levelUp: '[Level Up] You gained 100 exp.',
    gained: 'You gained < 100 exp> today.',
    ifx: 'If x < 5 and y > 3, stop.',
  };
  const results = {};
  let captureError = null;
  const cacheKey = 'extensions.zotero.zotero-tts.cacheAudio';
  const cacheSaved = { value: !!Zotero.Prefs.get('zotero-tts.cacheAudio'), user: Services.prefs.prefHasUserValue(cacheKey) };
  try {
    // ifx's prepared text never changes with stripping off, so a cache hit
    // from an earlier real request would serve it without a fetch at all;
    // force a miss so every one of the four is actually asked for afresh.
    Zotero.Prefs.set('zotero-tts.cacheAudio', false);
    for (const key of ['fireball', 'levelUp', 'gained', 'ifx']) {
      currentCalls = [];
      const segment = refreshed[key];
      if (!segment) { results[key] = { error: 'segment missing' }; continue; }
      try { await iface.getAudio(segment, { id: voiceID }); } catch (e) {}
      results[key] = { requestText: currentCalls[0]?.text ?? null, matchesRaw: currentCalls[0]?.text === expectedRaw[key] };
    }
  } catch (e) { captureError = { message: String(e), stack: e?.stack || null }; }
  finally {
    sandbox.fetch = originalFetch;
    if (cacheSaved.user) Zotero.Prefs.set('zotero-tts.cacheAudio', cacheSaved.value); else Services.prefs.clearUserPref(cacheKey);
  }

  return JSON.stringify({
    error, trace, textSettingsEntry, refreshedTexts, results, captureError,
    allUnchanged: ['fireball', 'levelUp', 'gained', 'ifx'].every(k => results[k] && results[k].matchesRaw),
  }, null, 1);
})()
