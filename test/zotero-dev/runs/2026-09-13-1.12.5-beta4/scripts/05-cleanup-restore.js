(async () => {
  const fixtureID = 25445;
  const prefix = 'extensions.zotero.zotero-tts.';
  const cleanup = { errors: [], readerClosed: false, fixtureErased: false };
  const readers = Zotero.Reader._readers || [];
  for (let i = 0; i < readers.length; i++) {
    if (readers[i].itemID !== fixtureID) continue;
    try {
      const pending = readers[i].close();
      if (pending && typeof pending.then === 'function') await pending;
      cleanup.readerClosed = true;
    } catch (e) { cleanup.errors.push('close: ' + String(e)); }
  }
  for (let i = 0; i < 40; i++) {
    let found = false;
    const list = Zotero.Reader._readers || [];
    for (let j = 0; j < list.length; j++) if (list[j].itemID === fixtureID) found = true;
    if (!found) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  try {
    const item = Zotero.Items.get(fixtureID);
    if (item) { await item.eraseTx(); cleanup.fixtureErased = true; }
  } catch (e) { cleanup.errors.push('erase: ' + String(e)); }
  // These values and user-value flags were read by the sanitized baseline.
  const clear = suffix => { const full = prefix + suffix; if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full); };
  clear('readAloud.volume');
  clear('readAloud.stripAngleBrackets');
  Services.prefs.setBoolPref(prefix + 'webdav.syncPositions', true);
  Services.prefs.setBoolPref(prefix + 'webdav.autoUploadSettings', true);
  clear('webdav.syncSettings');
  clear('cacheAudio');
  clear('prefetchEnabled');
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
  const pref = suffix => ({
    value: Zotero.Prefs.get('zotero-tts.' + suffix),
    user: Services.prefs.prefHasUserValue(prefix + suffix),
  });
  const finalPrefs = {};
  for (const suffix of ['readAloud.volume','readAloud.stripAngleBrackets','webdav.syncPositions','webdav.autoUploadSettings','webdav.syncSettings','cacheAudio','prefetchEnabled']) finalPrefs[suffix] = pref(suffix);
  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); }
  catch (e) { position = { error: String(e) }; }
  const remaining = [];
  const list = Zotero.Reader._readers || [];
  for (let i = 0; i < list.length; i++) {
    const manager = list[i]._internalReader && list[i]._internalReader._readAloudManager;
    remaining.push({ itemID: list[i].itemID, active: !!manager?.active, paused: manager ? !!manager.paused : null, voice: manager?.selectedVoiceID || null });
  }
  let fixtureExists = false;
  try { fixtureExists = !!Zotero.Items.get(fixtureID); } catch (e) { fixtureExists = false; }
  return JSON.stringify({ cleanup, fixtureExists, remaining, finalPrefs, debugStoring: !!Zotero.Debug.storing, position: {
    rows: position?.database?.rows ?? null,
    queued: position?.store?.queued ?? null,
    lastError: position?.store?.lastError ?? null,
  } }, null, 1);
})()
