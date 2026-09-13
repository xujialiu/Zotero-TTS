return (async () => {
  const base = Zotero.__ztts97Baseline;
  const state = Zotero.__ztts97NativeState;
  if (!base?.prefs) throw new Error('baseline snapshot is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fixtureIDs = [Zotero.__ztts97Fixture?.itemID].filter(Boolean);
  const closeFixture = async itemID => {
    const readers = Zotero.Reader._readers || [];
    let reader = null;
    for (let i = 0; i < readers.length; i++) if (readers[i]?.itemID === itemID) { reader = readers[i]; break; }
    if (!reader) return { itemID, closed: false, absent: true };
    try { reader._internalReader?.toggleReadAloudPopup(false); } catch (e) {}
    try {
      const internal = reader._internalReader;
      const manager = internal?._readAloudManager;
      const options = manager?._options;
      if (state?.originalRemoteInterface && options) Components.utils.waiveXrays(options).remoteInterface = state.originalRemoteInterface;
      if (state?.originalInternalRemoteInterface && internal) Components.utils.waiveXrays(internal)._readAloudRemoteInterface = state.originalInternalRemoteInterface;
    } catch (e) {}
    try { reader.close?.(); } catch (e) {}
    for (let i = 0; i < 50; i++) {
      let present = false;
      const current = Zotero.Reader._readers || [];
      for (let j = 0; j < current.length; j++) if (current[j]?.itemID === itemID) { present = true; break; }
      if (!present) return { itemID, closed: true, absent: true };
      await sleep(100);
    }
    return { itemID, closed: true, absent: false };
  };
  const readersClosed = [];
  for (const itemID of fixtureIDs) readersClosed.push(await closeFixture(itemID));
  const erased = [];
  for (const itemID of fixtureIDs) {
    const item = Zotero.Items.get(itemID);
    if (item) {
      try { await item.eraseTx(); erased.push({ itemID, erased: true }); }
      catch (e) { erased.push({ itemID, erased: false, error: String(e) }); }
    } else erased.push({ itemID, erased: false, absent: true });
  }
  if (state?.proto && state.original) {
    try { state.proto._getReadAloudRemoteInterface = state.original; state.patchRestored = state.proto._getReadAloudRemoteInterface === state.original; }
    catch (e) { state.patchRestoreError = String(e); }
  }
  const prefix = 'extensions.zotero.zotero-tts.';
  const restore = (fullName, entry) => {
    if (!entry) return;
    if (!entry.user) {
      if (Services.prefs.prefHasUserValue(fullName)) Services.prefs.clearUserPref(fullName);
      return;
    }
    if (typeof entry.value === 'boolean') Services.prefs.setBoolPref(fullName, entry.value);
    else if (Number.isInteger(entry.value)) Services.prefs.setIntPref(fullName, entry.value);
    else if (typeof entry.value === 'string') Services.prefs.setStringPref(fullName, entry.value);
  };
  for (const [suffix, entry] of Object.entries(base.prefs)) {
    if (suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices') continue;
    restore(prefix + suffix, entry);
  }
  restore('extensions.zotero.reader.readAloudVoices', base.prefs['reader.readAloudVoices']);
  restore(prefix + 'readAloud.memory', base.prefs['readAloud.memory']);
  await sleep(600);
  try {
    if (!!Zotero.Debug.storing !== !!base.debugStoring) Zotero.Debug.setStore(!!base.debugStoring);
  } catch (e) {}
  const read = (fullName, entry, redact = false) => {
    let value = null;
    try { value = Services.prefs.getPrefType(fullName) === Services.prefs.PREF_STRING ? Services.prefs.getStringPref(fullName) : Zotero.Prefs.get(fullName.replace(/^extensions\.zotero\./, '')); }
    catch (e) { value = null; }
    return redact
      ? { equalToBaseline: value === entry?.value, chars: typeof value === 'string' ? value.length : null, user: Services.prefs.prefHasUserValue(fullName) }
      : { value, user: Services.prefs.prefHasUserValue(fullName) };
  };
  const summaries = {};
  for (const [suffix, entry] of Object.entries(base.prefs)) {
    const fullName = suffix === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + suffix;
    summaries[suffix] = read(fullName, entry, suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices' || suffix === 'readAloud.favoriteVoices');
  }
  const mainWindow = Zotero.getMainWindow?.();
  let selectedTabRestored = false;
  try {
    if (base.selectedTabId && mainWindow?.Zotero_Tabs?.select) {
      mainWindow.Zotero_Tabs.select(base.selectedTabId);
      await sleep(250);
      selectedTabRestored = mainWindow.Zotero_Tabs.selectedID === base.selectedTabId;
    }
  } catch (e) {}
  const currentReaders = [];
  const list = Zotero.Reader._readers || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i]; const m = r?._internalReader?._readAloudManager;
    let title = null;
    try { const item = Zotero.Items.get(r.itemID); title = (item?.parentItem ?? item)?.getField('title') ?? null; } catch (e) {}
    currentReaders.push({ index: i, fixture: fixtureIDs.includes(r?.itemID), title, active: !!m?.active, paused: m ? !!m.paused : null, selected: m?.selectedVoiceID ?? null, tier: m?._selectedTier ?? null });
  }
  const remainingItems = fixtureIDs.filter(id => !!Zotero.Items.get(id));
  let remainingReaders = 0;
  for (let i = 0; i < list.length; i++) if (fixtureIDs.includes(list[i]?.itemID)) remainingReaders++;
  const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const result = {
    readersClosed,
    erased,
    fixtureReadersRemaining: remainingReaders,
    fixtureItemsRemaining: remainingItems.length,
    currentReaders,
    selectedTab: { expected: base.selectedTabId ?? null, actual: mainWindow?.Zotero_Tabs?.selectedID ?? null, restored: selectedTabRestored },
    prefs: summaries,
    position: { rows: position.database?.rows ?? null, queued: position.store?.queued ?? null, lastError: position.store?.lastError ?? null },
    debugStoring: !!Zotero.Debug.storing,
    patchRestored: !!state?.patchRestored,
  };
  delete Zotero.__ztts97NativeState;
  delete Zotero.__ztts97Fixture;
  delete Zotero.__ztts97Baseline;
  return JSON.stringify(result, null, 1);
})()
