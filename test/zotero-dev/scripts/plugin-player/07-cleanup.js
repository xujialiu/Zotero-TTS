(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const baseline = state.baseline || {};
  const fixtureIds = [state.fixtures?.pdf?.id, state.fixtures?.epub?.id].filter(Boolean);
  const pluginPrefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const read = suffix => suffix === 'reader.readAloudVoices' ? Services.prefs.getStringPref('extensions.zotero.reader.readAloudVoices', '') : Zotero.Prefs.get('zotero-tts.' + suffix);
  const user = suffix => Services.prefs.prefHasUserValue(suffix === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : pluginPrefix + suffix);
  const close = [], errors = [];
  // The two ids are disposable fixtures owned by this run. Never touch any other reader.
  for (const id of fixtureIds) {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) {
      const reader = list[i];
      if (reader?.itemID !== id) continue;
      try { const pending = reader.close(); if (pending && typeof pending.then === 'function') await pending; close.push(id); } catch (e) { errors.push('close ' + id + ': ' + String(e)); }
    }
  }
  for (let t = 0; t < 50; t++) {
    let found = false; const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) if (fixtureIds.includes(list[i]?.itemID)) found = true;
    if (!found) break; await sleep(100);
  }
  const erased = [];
  for (const id of fixtureIds) {
    try { const item = Zotero.Items.get(id); if (item) { await item.eraseTx(); erased.push(id); } } catch (e) { errors.push('erase ' + id + ': ' + String(e)); }
  }
  const original = baseline.prefs || {};
  const full = suffix => pluginPrefix + suffix;
  const setValue = (suffix, value, type) => {
    const name = full(suffix);
    if (type === Services.prefs.PREF_STRING) Services.prefs.setStringPref(name, String(value));
    else if (type === Services.prefs.PREF_BOOL) Services.prefs.setBoolPref(name, !!value);
    else if (type === Services.prefs.PREF_INT) Services.prefs.setIntPref(name, Math.round(Number(value)));
  };
  const restore = suffix => {
    const snap = original[suffix]; if (!snap || snap.type === Services.prefs.PREF_INVALID) return;
    setValue(suffix, snap.value, snap.type);
    const name = full(suffix);
    if (!snap.user && Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name);
  };
  // Restore every named case pref except memory, which must be the final pref write.
  for (const suffix of ['readAloud.volume', 'readAloud.favoriteVoices', 'readAloud.favoritesOnly', 'readAloud.usePluginPlayer', 'readAloud.playerLayout', 'readAloud.autoScrollEnabled', 'readAloud.autoScrollMode', 'readAloud.keepFollowingWhileVisible', 'readAloud.globalSpeed', 'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings', 'prefetchEnabled', 'cacheAudio']) restore(suffix);
  const nativeSnapshot = original['reader.readAloudVoices'];
  const voicePref = 'extensions.zotero.reader.readAloudVoices';
  if (nativeSnapshot && nativeSnapshot.type === Services.prefs.PREF_STRING) {
    Services.prefs.setStringPref(voicePref, String(nativeSnapshot.value));
    if (!nativeSnapshot.user && Services.prefs.prefHasUserValue(voicePref)) Services.prefs.clearUserPref(voicePref);
  } else {
    errors.push('reader.readAloudVoices baseline snapshot missing; native pref not rewritten');
  }
  const memorySnapshot = original['readAloud.memory'];
  if (memorySnapshot && memorySnapshot.type === Services.prefs.PREF_STRING) {
    Services.prefs.setStringPref(full('readAloud.memory'), String(memorySnapshot.value));
    if (!memorySnapshot.user && Services.prefs.prefHasUserValue(full('readAloud.memory'))) Services.prefs.clearUserPref(full('readAloud.memory'));
  } else {
    errors.push('readAloud.memory baseline snapshot missing; memory not rewritten');
  }
  if (baseline.debugStoring !== undefined && !!Zotero.Debug?.storing !== !!baseline.debugStoring) Zotero.Debug.setStore(!!baseline.debugStoring);
  let position = null; try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { errors.push('position: ' + String(e)); }
  const remaining = []; const list = Zotero.Reader?._readers || [];
  for (let i = 0; i < list.length; i++) { const r = list[i]; if (!r) continue; const m = r._internalReader?._readAloudManager; remaining.push({ itemID: r.itemID, active: !!m?.active, paused: !!m?.paused }); }
  const finalPrefs = {};
  for (const suffix of ['readAloud.volume', 'readAloud.memory', 'reader.readAloudVoices', 'readAloud.favoriteVoices', 'readAloud.favoritesOnly', 'readAloud.usePluginPlayer', 'readAloud.playerLayout', 'readAloud.autoScrollEnabled', 'readAloud.autoScrollMode', 'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings']) finalPrefs[suffix] = { value: read(suffix), user: user(suffix) };
  state.cleanup = { close, erased, errors, remaining, fixtureRows: position?.database?.rows ?? null, baselineRows: baseline.positionRows ?? null, finalPrefs, debugStoring: !!Zotero.Debug?.storing };
  return JSON.stringify(state.cleanup, null, 1);
})()
