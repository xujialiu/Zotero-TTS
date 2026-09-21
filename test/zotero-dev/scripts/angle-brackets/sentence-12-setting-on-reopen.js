(async () => {
  const fixtureID = Zotero.ZoteroTTSRun.state.fixtureItemID;
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) reader = list[i];
  if (!reader) return JSON.stringify({ error: 'fixture reader missing' });
  const internal = reader._internalReader;
  const manager = internal?._readAloudManager;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = label => ({ label, active: !!manager?.active, paused: manager ? !!manager.paused : null });
  const trace = [state('before-stop')];
  let error = null;
  try {
    Zotero.Prefs.set('zotero-tts.readAloud.stripAngleBrackets', true);
    internal.toggleReadAloudPopup(false);
    for (let i = 0; i < 30; i++) { if (!manager?.active) break; await wait(100); }
    trace.push(state('after-stop'));
    internal.toggleReadAloudPopup(true);
    for (let i = 0; i < 50; i++) { if (manager?.active && manager._controller) break; await wait(100); }
    trace.push(state('after-reopen'));
    await wait(400);
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

  const segs = (manager && manager.segments) || [];
  const fireball = segs[7] || null;
  const voiceID = manager ? manager.selectedVoiceID : null;
  const iface = manager?._options?.remoteInterface;
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  let currentCalls = [];
  sandbox.fetch = function (input, init) {
    let body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) {}
    currentCalls.push({ text: typeof body?.text === 'string' ? body.text : null });
    return Promise.reject(new Error('zotero-tester: request blocked before the network (issue #127 setting-on confirmation)'));
  };
  // Fireball's stripped text was already cached (real) from sentence-08,
  // so leaving the cache on here would serve it with no fetch at all --
  // force a miss so the recheck actually asks and captures the text.
  const cacheKey = 'extensions.zotero.zotero-tts.cacheAudio';
  const cacheSaved = { value: !!Zotero.Prefs.get('zotero-tts.cacheAudio'), user: Services.prefs.prefHasUserValue(cacheKey) };
  let requestText = null;
  try {
    Zotero.Prefs.set('zotero-tts.cacheAudio', false);
    if (iface && voiceID && fireball) { try { await iface.getAudio(fireball, { id: voiceID }); } catch (e) {} }
    requestText = currentCalls[0]?.text ?? null;
  } finally {
    sandbox.fetch = originalFetch;
    if (cacheSaved.user) Zotero.Prefs.set('zotero-tts.cacheAudio', cacheSaved.value); else Services.prefs.clearUserPref(cacheKey);
  }

  return JSON.stringify({
    error, trace, textSettingsEntry,
    fireballRequestText: requestText,
    strippingResumed: requestText === 'He cast Fireball at the wolf.',
  }, null, 1);
})()
