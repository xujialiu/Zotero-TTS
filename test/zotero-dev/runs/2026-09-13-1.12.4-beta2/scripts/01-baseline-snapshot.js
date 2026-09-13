(async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const keys = [
    'readAloud.stripAngleBrackets',
    'readAloud.volume',
    'webdav.syncPositions',
    'webdav.autoUploadSettings',
    'webdav.syncSettings',
    'readAloud.memory'
  ];
  const snapshot = {};
  for (const suffix of keys) {
    const full = prefix + suffix;
    const raw = Zotero.Prefs.get('zotero-tts.' + suffix);
    snapshot[suffix] = { value: raw, user: Services.prefs.prefHasUserValue(full) };
  }
  const readers = [];
  const list = Zotero.Reader._readers || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    let title = null;
    try {
      const item = Zotero.Items.get(r.itemID);
      const parent = item && item.parentItem ? Zotero.Items.get(item.parentItem) : item;
      title = parent ? parent.getField('title') : null;
    } catch (e) { title = 'unreadable'; }
    let manager = null;
    try { manager = r._internalReader && r._internalReader._readAloudManager; } catch (e) {}
    readers.push({
      title,
      active: !!(manager && manager.active),
      paused: manager ? !!manager.paused : null,
      selectedVoiceID: manager ? manager.selectedVoiceID : null,
      selectedTier: manager ? manager._selectedTier : null
    });
  }
  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); }
  catch (e) { position = { error: String(e) }; }
  return JSON.stringify({
    zoteroVersion: Zotero.version,
    readers,
    settingsWindowOpen: !!Services.wm.getMostRecentWindow('zotero:pref'),
    debugStoring: !!Zotero.Debug.storing,
    prefs: snapshot,
    position
  }, null, 1);
})()
