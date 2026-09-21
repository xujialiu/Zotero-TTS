(async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const keys = [
    'readAloud.stripAngleBrackets',
    'readAloud.bracketPairs',
    'readAloud.volume',
    'webdav.syncPositions',
    'webdav.autoUploadSettings',
    'webdav.syncSettings',
    'cacheAudio',
    'prefetchEnabled',
    'fish.enabled',
    'fish.freeOnly',
    'readAloud.memory',
  ];
  const prefs = {};
  for (const suffix of keys) {
    const value = Zotero.Prefs.get('zotero-tts.' + suffix);
    const user = Services.prefs.prefHasUserValue(prefix + suffix);
    prefs[suffix] = { value, user };
  }
  const readers = [];
  const list = Zotero.Reader._readers || [];
  for (let i = 0; i < list.length; i++) {
    const reader = list[i];
    let title = null;
    try {
      const item = Zotero.Items.get(reader.itemID);
      const parent = item && item.parentItem ? item.parentItem : item;
      title = parent && parent.getField ? parent.getField('title') : null;
    } catch (e) { title = 'unreadable'; }
    const manager = reader._internalReader && reader._internalReader._readAloudManager;
    readers.push({
      itemID: reader.itemID,
      title,
      active: !!manager?.active,
      paused: manager ? !!manager.paused : null,
      selectedVoiceID: manager?.selectedVoiceID || null,
      selectedTier: manager?._selectedTier || null,
    });
  }
  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); }
  catch (e) { position = { error: String(e) }; }
  const debugStoring = !!Zotero.Debug.storing;
  const settingsWindowOpen = !!Services.wm.getMostRecentWindow('zotero:pref');
  Zotero.ZoteroTTSRun.state.baseline = { prefs, readers, position, debugStoring, settingsWindowOpen };
  return JSON.stringify({
    zoteroVersion: Zotero.version,
    readers,
    settingsWindowOpen,
    debugStoring,
    prefs: Object.fromEntries(Object.entries(prefs).map(([suffix, entry]) => [
      suffix,
      suffix === 'readAloud.memory'
        ? { user: entry.user, valueKind: typeof entry.value, valueSet: entry.value != null }
        : entry,
    ])),
    position: {
      databaseRows: position?.database?.rows ?? null,
      queued: position?.store?.queued ?? null,
      lastError: position?.store?.lastError ?? null,
      storedReaders: (position?.readers || []).map(reader => ({
        itemID: reader.itemID,
        pageIndex: reader.stored?.pageIndex ?? null,
        kind: reader.stored?.kind ?? null,
      })),
    },
  }, null, 1);
})()
