(async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const keys = [
    'readAloud.stripAngleBrackets',
    'readAloud.volume',
    'webdav.syncPositions',
    'webdav.autoUploadSettings',
    'webdav.syncSettings',
    'cacheAudio',
    'prefetchEnabled',
  ];
  const prefs = {};
  for (const suffix of keys) {
    prefs[suffix] = {
      value: Zotero.Prefs.get('zotero-tts.' + suffix),
      user: Services.prefs.prefHasUserValue(prefix + suffix),
    };
  }
  const readers = [];
  const list = Zotero.Reader._readers || [];
  for (let i = 0; i < list.length; i++) {
    const reader = list[i];
    const manager = reader._internalReader && reader._internalReader._readAloudManager;
    readers.push({
      itemID: reader.itemID,
      active: !!manager?.active,
      paused: manager ? !!manager.paused : null,
      voice: manager?.selectedVoiceID || null,
      tier: manager?._selectedTier || null,
    });
  }
  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); }
  catch (e) { position = { error: String(e) }; }
  return JSON.stringify({
    zoteroVersion: Zotero.version,
    settingsWindowOpen: !!Services.wm.getMostRecentWindow('zotero:pref'),
    debugStoring: !!Zotero.Debug.storing,
    prefs,
    readers,
    position: {
      rows: position?.database?.rows ?? null,
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
