return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const suffixes = [
    'readAloud.keepFollowingWhileVisible',
    'readAloud.autoScrollMode',
    'readAloud.volume',
    'readAloud.memory',
    'readAloud.sameForAllDocuments',
    'webdav.syncPositions',
    'webdav.autoUploadSettings',
    'webdav.syncSettings',
  ];
  const full = suffix => prefix + suffix;
  const readPref = name => {
    const user = Services.prefs.prefHasUserValue(name);
    const type = Services.prefs.getPrefType(name);
    let value = null;
    try {
      if (type === Services.prefs.PREF_BOOL) value = Services.prefs.getBoolPref(name);
      else if (type === Services.prefs.PREF_INT) value = Services.prefs.getIntPref(name);
      else if (type === Services.prefs.PREF_STRING) value = Services.prefs.getStringPref(name);
    } catch (e) { value = null; }
    return { type, user, value };
  };
  const prefs = {};
  for (const suffix of suffixes) prefs[suffix] = readPref(full(suffix));
  prefs['reader.readAloudVoices'] = readPref('extensions.zotero.reader.readAloudVoices');
  prefs['reader.readAloud.highlightGranularity'] = readPref('extensions.zotero.reader.readAloud.highlightGranularity');
  const titleOf = reader => {
    try {
      const item = Zotero.Items.get(reader.itemID);
      return (item?.parentItem ? Zotero.Items.get(item.parentItem) : item)?.getField('title') ?? null;
    } catch (e) { return null; }
  };
  const readers = (Zotero.Reader._readers ?? []).map(reader => {
    const manager = reader?._internalReader?._readAloudManager;
    const controller = manager?._controller;
    const view = reader?._internalReader?._primaryView;
    let popupOpen = null;
    try { popupOpen = !!reader?._internalReader?._state?.readAloudState?.popupOpen; } catch (e) {}
    return {
      itemID: reader?.itemID ?? null,
      tabID: reader?.tabID ?? null,
      title: titleOf(reader),
      active: !!manager?.active,
      paused: !!manager?.paused,
      popupOpen,
      selectedVoiceID: manager?.selectedVoiceID ?? null,
      tier: manager?._selectedTier ?? null,
      position: Number.isFinite(controller?._position) ? controller._position : null,
      flow: view?.flowMode ?? null,
      bookmark: view?._readAloudPosition ?? null,
    };
  });
  const settingsWindow = Services.wm.getMostRecentWindow('zotero:pref');
  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { position = { error: String(e) }; }
  const debugStoring = !!Zotero.Debug?.storing;
  if (!debugStoring) try { Zotero.Debug.setStore(true); } catch (e) {}
  const errors = (Zotero.getErrors?.() ?? []).map(e => String(e));
  Zotero.__ztts100Baseline = {
    prefs,
    readers,
    selectedTabID: globalThis.Zotero_Tabs?.selectedID ?? null,
    settingsOpen: !!settingsWindow,
    debugStoring,
    baselineErrors: errors,
    position,
    capturedAt: Date.now(),
  };
  const summarize = (suffix, entry) => {
    const secretish = suffix.endsWith('memory') || suffix.includes('Voices');
    return secretish
      ? { type: entry.type, user: entry.user, present: entry.value !== null, chars: typeof entry.value === 'string' ? entry.value.length : null }
      : { type: entry.type, user: entry.user, value: entry.value };
  };
  const prefSummary = Object.fromEntries(Object.entries(prefs).map(([key, entry]) => [key, summarize(key, entry)]));
  return JSON.stringify({
    zotero: Zotero.version,
    readers,
    selectedTabID: globalThis.Zotero_Tabs?.selectedID ?? null,
    settingsOpen: !!settingsWindow,
    debugStoringBefore: debugStoring,
    debugStoringDuringRun: !!Zotero.Debug?.storing,
    errorsBeforeCount: errors.length,
    preferenceSummary: prefSummary,
    position,
  });
})()
