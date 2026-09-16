return (async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const p = Services.prefs;
  const names = [
    'readAloud.keepFollowingWhileVisible',
    'readAloud.autoScrollMode',
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
    const type = p.getPrefType(name);
    const user = p.prefHasUserValue(name);
    let value = null;
    try {
      if (type === p.PREF_BOOL) value = p.getBoolPref(name);
      else if (type === p.PREF_INT) value = p.getIntPref(name);
      else if (type === p.PREF_STRING) value = p.getStringPref(name);
    } catch (e) {}
    return { type, user, value };
  };
  const prefs = {};
  for (const suffix of names) prefs[full(suffix)] = read(full(suffix));
  prefs['extensions.zotero.reader.readAloudVoices'] = read('extensions.zotero.reader.readAloudVoices');
  prefs['extensions.zotero.reader.readAloud.highlightGranularity'] = read('extensions.zotero.reader.readAloud.highlightGranularity');
  const readers = [];
  for (const reader of Zotero.Reader._readers || []) {
    const ir = reader?._internalReader;
    const manager = ir?._readAloudManager;
    let item = null;
    try { item = Zotero.Items.get(reader.itemID); } catch (e) {}
    let title = null;
    try { title = (item?.parentItem ? Zotero.Items.get(item.parentItem) : item)?.getField('title') ?? null; } catch (e) {}
    readers.push({
      itemID: reader?.itemID ?? null,
      key: item?.key ?? null,
      title,
      tabID: reader?.tabID ?? null,
      active: !!manager?.active,
      paused: !!manager?.paused,
      popupOpen: !!ir?._state?.readAloudState?.popupOpen,
      position: Number.isFinite(manager?._controller?._position) ? manager._controller._position : null,
      flow: ir?._primaryView?.flowMode ?? null,
      voice: manager?.selectedVoiceID ?? null,
      tier: manager?._selectedTier ?? null,
    });
  }
  const settingsOpen = !!Services.wm.getMostRecentWindow('zotero:pref');
  const debugStoring = !!Zotero.Debug?.storing;
  if (!debugStoring) try { Zotero.Debug.setStore(true); } catch (e) {}
  state.baseline = {
    prefs,
    readers,
    selectedTabID: globalThis.Zotero_Tabs?.selectedID ?? null,
    settingsOpen,
    debugStoring,
    errors: (Zotero.getErrors?.() || []).map(String),
    capturedAt: new Date().toISOString(),
  };
  const summary = {};
  for (const [name, saved] of Object.entries(prefs)) {
    summary[name] = /readAloud\.memory$|reader\.readAloudVoices$/.test(name)
      ? { type: saved.type, user: saved.user, present: saved.value !== null, chars: typeof saved.value === 'string' ? saved.value.length : null }
      : saved;
  }
  return JSON.stringify({
    zotero: Zotero.version,
    readers,
    selectedTabID: state.baseline.selectedTabID,
    settingsOpen,
    debugStoringBefore: debugStoring,
    errorsBeforeCount: state.baseline.errors.length,
    preferenceSummary: summary,
  });
})()
