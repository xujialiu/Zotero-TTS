return (async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const pluginKeys = [
    'readAloud.volume', 'readAloud.sameForAllDocuments', 'readAloud.globalSpeed',
    'readAloud.favoriteVoices', 'readAloud.favoritesOnly', 'readAloud.memory',
    'shortcuts.previousVoice', 'shortcuts.nextVoice', 'webdav.syncPositions',
    'webdav.autoUploadSettings', 'webdav.syncSettings',
  ];
  const read = full => {
    let value = null;
    try { value = Zotero.Prefs.get(full.replace(/^extensions\.zotero\./, '')); } catch (e) { value = null; }
    return { value, user: Services.prefs.prefHasUserValue(full) };
  };
  const prefs = {};
  for (const suffix of pluginKeys) prefs[suffix] = read(prefix + suffix);
  const nativeName = 'extensions.zotero.reader.readAloudVoices';
  prefs['reader.readAloudVoices'] = read(nativeName);
  const readers = [];
  const list = Zotero.Reader._readers || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i], m = r?._internalReader?._readAloudManager;
    let title = null;
    try { const item = Zotero.Items.get(r.itemID); title = (item?.parentItem ? Zotero.Items.get(item.parentItem) : item)?.getField('title') ?? null; } catch (e) {}
    readers.push({ itemID: r.itemID, tabID: r.tabID, title, active: !!m?.active, paused: m?.paused ?? null,
      popupOpen: !!r?._internalReader?._state?.readAloudState?.popupOpen, voice: m?.selectedVoiceID ?? null,
      tier: m?._selectedTier ?? null, position: Number.isFinite(m?._controller?._position) ? m._controller._position : null });
  }
  const mainWindow = Zotero.getMainWindow?.();
  state.baseline = { prefs, readers, selectedTabID: mainWindow?.Zotero_Tabs?.selectedID ?? null,
    settingsWindowOpen: !!Services.wm.getMostRecentWindow('zotero:pref'), debugStoring: !!Zotero.Debug.storing };
  for (const suffix of ['webdav.autoUploadSettings', 'webdav.syncSettings', 'webdav.syncPositions']) Services.prefs.setBoolPref(prefix + suffix, false);
  Services.prefs.setIntPref(prefix + 'readAloud.volume', 0);
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
  const summary = {};
  for (const suffix of pluginKeys.concat('reader.readAloudVoices')) {
    const name = suffix === 'reader.readAloudVoices' ? nativeName : prefix + suffix;
    const now = read(name);
    summary[suffix] = ['readAloud.memory', 'readAloud.favoriteVoices', 'reader.readAloudVoices'].includes(suffix)
      ? { present: now.value !== null && now.value !== undefined, chars: typeof now.value === 'string' ? now.value.length : null, user: now.user }
      : now;
  }
  return JSON.stringify({ zotero: Zotero.version, readers, selectedTabID: state.baseline.selectedTabID,
    settingsWindowOpen: state.baseline.settingsWindowOpen, debugStoring: !!Zotero.Debug.storing, prefs: summary }, null, 1);
})()
