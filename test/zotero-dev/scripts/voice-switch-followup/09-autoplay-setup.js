return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const keys = ['readAloud.volume', 'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings'];
  const readPref = suffix => {
    const name = prefix + suffix;
    let value = null;
    try { const type = Services.prefs.getPrefType(name); value = type === Services.prefs.PREF_BOOL ? Services.prefs.getBoolPref(name) : type === Services.prefs.PREF_INT ? Services.prefs.getIntPref(name) : Services.prefs.getStringPref(name); } catch (e) {}
    return { value, user: Services.prefs.prefHasUserValue(name) };
  };
  const prefs = {};
  for (const key of keys) prefs[key] = readPref(key);
  const mainWindow = Zotero.getMainWindow();
  const state = { itemID: null, reader: null, window: null, selectedBefore: mainWindow?.Zotero_Tabs?.selectedID ?? null, prefs, openError: null, probe: null, syncContext: null, delayedContext: null, listener: null };
  Zotero.__ztts95AutoplayProbe = state;
  Services.prefs.setBoolPref(prefix + 'webdav.syncPositions', false);
  Services.prefs.setBoolPref(prefix + 'webdav.autoUploadSettings', false);
  Services.prefs.setBoolPref(prefix + 'webdav.syncSettings', false);
  Services.prefs.setIntPref(prefix + 'readAloud.volume', 0);
  const file = 'C:\\Users\\xujia\\orca\\workspaces\\zotero_plugin_tts\\shortcut_swtich_voice\\test\\fixtures\\fixture-a.pdf';
  const title = 'Zotero-TTS issue 95 autoplay context diagnostic ' + Date.now();
  try {
    const imported = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    state.itemID = item?.id ?? null;
    state.key = item?.key ?? null;
    state.title = title;
    if (!state.itemID) throw new Error('diagnostic fixture import returned no item');
    const opening = Zotero.Reader.open(state.itemID, null, { openInBackground: false, allowDuplicate: false });
    Promise.resolve(opening).catch(e => { state.openError = String(e); });
  } catch (e) { state.openError = String(e); }
  return JSON.stringify({ itemID: state.itemID, key: state.key, title: state.title, openError: state.openError, selectedBefore: state.selectedBefore, transportDisabled: true }, null, 1);
})()
