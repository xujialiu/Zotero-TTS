(async () => {
  const p = Zotero.ZoteroTTSRun.params || {};
  const state = Zotero.ZoteroTTSRun.state || (Zotero.ZoteroTTSRun.state = {});
  const prefix = 'extensions.zotero.zotero-tts.';
  const names = [
    'readAloud.volume', 'readAloud.memory', 'readAloud.favoriteVoices',
    'readAloud.favoritesOnly', 'readAloud.usePluginPlayer', 'readAloud.playerLayout',
    'readAloud.autoScrollEnabled', 'readAloud.autoScrollMode',
    'readAloud.keepFollowingWhileVisible', 'readAloud.globalSpeed',
    'readAloud.highlightGranularity', 'webdav.syncPositions',
    'webdav.autoUploadSettings', 'webdav.syncSettings', 'prefetchEnabled', 'cacheAudio',
    'reader.readAloudVoices',
  ];
  const fullName = suffix => suffix.startsWith('reader.') ? 'extensions.zotero.' + suffix : prefix + suffix;
  const read = suffix => {
    const full = fullName(suffix), type = Services.prefs.getPrefType(full);
    let value = null;
    try {
      if (type === Services.prefs.PREF_STRING) value = Services.prefs.getStringPref(full);
      else if (type === Services.prefs.PREF_BOOL) value = Services.prefs.getBoolPref(full);
      else if (type === Services.prefs.PREF_INT) value = Services.prefs.getIntPref(full);
    } catch (e) { value = '[unreadable]'; }
    return { value, user: Services.prefs.prefHasUserValue(full), type };
  };
  const snap = {};
  for (const suffix of names) snap[suffix] = read(suffix);
  state.baseline = { prefs: snap, debugStoring: !!Zotero.Debug?.storing, runId: p.runId || null };
  if (!Zotero.Debug?.storing) Zotero.Debug.setStore(true);
  const restore = state.baseline.prefs;
  const set = (suffix, value) => {
    const full = fullName(suffix), type = Services.prefs.getPrefType(full);
    if (type === Services.prefs.PREF_STRING) Services.prefs.setStringPref(full, String(value));
    else if (type === Services.prefs.PREF_BOOL) Services.prefs.setBoolPref(full, !!value);
    else if (type === Services.prefs.PREF_INT) Services.prefs.setIntPref(full, Math.round(Number(value)));
  };
  // Keep temporary volume and sync changes out of WebDAV/backup.
  set('readAloud.volume', 0);
  set('webdav.syncPositions', false);
  set('webdav.autoUploadSettings', false);
  set('webdav.syncSettings', false);
  state.baseline.muted = read('readAloud.volume');
  state.baseline.syncGuard = {
    positions: read('webdav.syncPositions'), autoUpload: read('webdav.autoUploadSettings'), settings: read('webdav.syncSettings'),
  };
  const readers = [];
  const list = Zotero.Reader?._readers || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i]; if (!r) continue;
    const m = r._internalReader?._readAloudManager;
    let title = null;
    try { const item = Zotero.Items.get(r.itemID); const parent = item?.parentItem ? Zotero.Items.get(item.parentItem) : item; title = parent?.getField('title') || null; } catch (e) {}
    readers.push({ itemID: r.itemID, title, active: !!m?.active, paused: !!m?.paused, popupOpen: !!m?.popupOpen, voice: m?.selectedVoiceID || null, type: r.type || null });
  }
  state.baseline.readers = readers;
  let startup = null;
  try { startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup()); } catch (e) { startup = { error: String(e) }; }
  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { position = { error: String(e) }; }
  state.baseline.startup = startup;
  state.baseline.positionRows = position?.database?.rows ?? null;
  state.baseline.errors = String(Zotero.getErrors?.() ?? '');
  return JSON.stringify({
    runId: p.runId || null, startup, readers,
    prefs: { volume: read('readAloud.volume'), memory: read('readAloud.memory'), readerVoices: read('reader.readAloudVoices'), favoriteVoices: read('readAloud.favoriteVoices'), favoritesOnly: read('readAloud.favoritesOnly'), usePluginPlayer: read('readAloud.usePluginPlayer'), playerLayout: read('readAloud.playerLayout'), autoScrollEnabled: read('readAloud.autoScrollEnabled'), autoScrollMode: read('readAloud.autoScrollMode') },
    syncGuard: state.baseline.syncGuard,
    positionRows: state.baseline.positionRows,
    debugStoring: !!Zotero.Debug?.storing,
  }, null, 1);
})()
