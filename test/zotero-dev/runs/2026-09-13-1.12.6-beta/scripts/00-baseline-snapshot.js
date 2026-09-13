return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const pluginKeys = [
    'readAloud.volume',
    'readAloud.sameForAllDocuments',
    'readAloud.globalSpeed',
    'readAloud.favoriteVoices',
    'readAloud.favoritesOnly',
    'readAloud.sentenceDelayEnabled',
    'readAloud.sentenceDelayMs',
    'readAloud.paragraphDelayEnabled',
    'readAloud.paragraphDelayMs',
    'shortcuts.previousVoice',
    'shortcuts.nextVoice',
    'webdav.syncPositions',
    'webdav.autoUploadSettings',
    'webdav.syncSettings',
    'readAloud.memory',
  ];
  const full = suffix => prefix + suffix;
  const snap = {};
  const readPlugin = suffix => {
    const name = full(suffix);
    let value = null;
    try { value = Zotero.Prefs.get('zotero-tts.' + suffix); } catch (e) { value = null; }
    return { value, user: Services.prefs.prefHasUserValue(name) };
  };
  for (const suffix of pluginKeys) snap[suffix] = readPlugin(suffix);
  const nativeName = 'extensions.zotero.reader.readAloudVoices';
  let nativeValue = null;
  try { nativeValue = Zotero.Prefs.get('reader.readAloudVoices'); } catch (e) { nativeValue = null; }
  snap['reader.readAloudVoices'] = { value: nativeValue, user: Services.prefs.prefHasUserValue(nativeName) };
  const mainWindow = Zotero.getMainWindow?.();
  const selectedTabId = mainWindow?.Zotero_Tabs?.selectedID ?? null;
  Zotero.__ztts97Baseline = { prefs: snap, debugStoring: !!Zotero.Debug.storing, selectedTabId };
  const summary = {};
  for (const [key, entry] of Object.entries(snap)) {
    const secret = key === 'readAloud.memory' || key === 'reader.readAloudVoices' || key === 'readAloud.favoriteVoices';
    summary[key] = secret
      ? { present: entry.value !== null && entry.value !== undefined, chars: typeof entry.value === 'string' ? entry.value.length : null, user: entry.user }
      : entry;
  }
  const readers = [];
  const list = Zotero.Reader._readers || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    let m = null;
    try { m = r._internalReader?._readAloudManager; } catch (e) {}
    readers.push({
      index: i,
      active: !!m?.active,
      paused: m ? !!m.paused : null,
      popupOpen: !!r._internalReader?._state?.readAloudState?.popupOpen,
      selectedVoice: !!m?.selectedVoiceID,
      selectedTier: m?._selectedTier ?? null,
      position: Number.isFinite(m?._controller?._position) ? m._controller._position : null,
    });
  }
  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); }
  catch (e) { position = { error: String(e) }; }
  return JSON.stringify({
    zoteroVersion: Zotero.version,
    platform: Services.appinfo.OS,
    readers,
    settingsWindowOpen: !!Services.wm.getMostRecentWindow('zotero:pref'),
    selectedTabId,
    debugStoring: !!Zotero.Debug.storing,
    prefs: summary,
    position,
  }, null, 1);
})()
