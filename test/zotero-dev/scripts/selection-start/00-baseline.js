return (async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const prefs = Services.prefs;
  const names = [
    'readAloud.volume',
    'readAloud.memory',
    'readAloud.sameForAllDocuments',
    'readAloud.stripAngleBrackets',
    'readAloud.bracketPairs',
    'webdav.syncPositions',
    'webdav.autoUploadSettings',
    'webdav.syncSettings',
  ];
  const full = suffix => 'extensions.zotero.zotero-tts.' + suffix;
  const read = name => {
    const type = prefs.getPrefType(name);
    const user = prefs.prefHasUserValue(name);
    let value = null;
    try {
      if (type === prefs.PREF_BOOL) value = prefs.getBoolPref(name);
      else if (type === prefs.PREF_INT) value = prefs.getIntPref(name);
      else if (type === prefs.PREF_STRING) value = prefs.getStringPref(name);
    } catch (e) {}
    return { type, user, value };
  };
  const saved = {};
  for (const suffix of names) saved[full(suffix)] = read(full(suffix));
  saved['extensions.zotero.reader.readAloudVoices'] = read('extensions.zotero.reader.readAloudVoices');
  saved['extensions.zotero.reader.readAloud.highlightGranularity'] = read('extensions.zotero.reader.readAloud.highlightGranularity');
  const readers = [];
  for (const reader of Zotero.Reader._readers || []) {
    const ir = reader?._internalReader;
    const manager = ir?._readAloudManager;
    const item = (() => { try { return Zotero.Items.get(reader.itemID); } catch (e) { return null; } })();
    const parent = item?.parentItem ? Zotero.Items.get(item.parentItem) : item;
    readers.push({
      itemID: reader?.itemID ?? null,
      key: item?.key ?? null,
      title: parent?.getField?.('title') ?? null,
      tabID: reader?.tabID ?? null,
      active: !!manager?.active,
      paused: !!manager?.paused,
      popupOpen: !!ir?._state?.readAloudState?.popupOpen,
      position: Number.isFinite(manager?._controller?._position) ? manager._controller._position : null,
      voice: manager?.selectedVoiceID ?? null,
      tier: manager?._selectedTier ?? null,
    });
  }
  const settingsOpen = !!Services.wm.getMostRecentWindow('zotero:pref');
  const debugStoring = !!Zotero.Debug?.storing;
  if (!debugStoring) try { Zotero.Debug.setStore(true); } catch (e) {}
  state.baseline = {
    prefs: saved,
    readers,
    selectedTabID: globalThis.Zotero_Tabs?.selectedID ?? null,
    settingsOpen,
    debugStoring,
    errors: (Zotero.getErrors?.() || []).map(String),
  };
  const summary = {};
  for (const [name, value] of Object.entries(saved)) {
    summary[name] = name.endsWith('.memory') || name.endsWith('readAloudVoices')
      ? { type: value.type, user: value.user, present: value.value !== null, chars: typeof value.value === 'string' ? value.value.length : null }
      : value;
  }
  return JSON.stringify({ zotero: Zotero.version, readers, selectedTabID: state.baseline.selectedTabID, settingsOpen, debugStoringBefore: debugStoring, preferenceSummary: summary });
})()
