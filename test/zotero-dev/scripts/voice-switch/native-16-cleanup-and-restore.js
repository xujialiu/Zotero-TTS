return (async () => {
  const base = Zotero.__ztts95Baseline;
  const state = Zotero.__ztts95NativeState;
  if (!base?.prefs) throw new Error('baseline snapshot is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fixtureIDs = [Zotero.__ztts95Fixture?.itemID, Zotero.__ztts95FixtureB?.itemID].filter(Boolean);
  const closeFixture = async itemID => {
    const reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
    if (!reader) return { itemID, closed: false, absent: true };
    try { reader._internalReader?.toggleReadAloudPopup(false); } catch (e) {}
    try { reader.close?.(); } catch (e) {}
    for (let i = 0; i < 50; i++) {
      if (!(Zotero.Reader._readers || []).some(r => r?.itemID === itemID)) return { itemID, closed: true, absent: true };
      await sleep(100);
    }
    return { itemID, closed: true, absent: false };
  };
  const readersClosed = [];
  for (const itemID of fixtureIDs) readersClosed.push(await closeFixture(itemID));
  const erased = [];
  for (const itemID of fixtureIDs) {
    const item = Zotero.Items.get(itemID);
    if (item) { try { await item.eraseTx(); erased.push({ itemID, erased: true }); } catch (e) { erased.push({ itemID, erased: false, error: String(e) }); } }
    else erased.push({ itemID, erased: false, absent: true });
  }
  if (state?.proto && state.original) state.proto._getReadAloudRemoteInterface = state.original;
  const prefix = 'extensions.zotero.zotero-tts.';
  const restore = (fullName, entry) => {
    if (!entry) return;
    if (!entry.user) { if (Services.prefs.prefHasUserValue(fullName)) Services.prefs.clearUserPref(fullName); return; }
    if (typeof entry.value === 'boolean') Services.prefs.setBoolPref(fullName, entry.value);
    else if (Number.isInteger(entry.value)) Services.prefs.setIntPref(fullName, entry.value);
    else if (typeof entry.value === 'string') Services.prefs.setStringPref(fullName, entry.value);
  };
  // Keep uploads and sync disabled while all temporary voice and timing state
  // is restored. The original sync values are restored before memory, as in
  // the project's existing live-test cleanup order.
  const keys = Object.keys(base.prefs);
  for (const suffix of keys) {
    if (suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices') continue;
    restore(suffix === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + suffix, base.prefs[suffix]);
  }
  restore('extensions.zotero.reader.readAloudVoices', base.prefs['reader.readAloudVoices']);
  // Required final memory write: do not expose its contents in the result.
  restore(prefix + 'readAloud.memory', base.prefs['readAloud.memory']);
  await sleep(500);
  if (base.debugStoring && !Zotero.Debug.storing) Zotero.Debug.setStore(true);
  const read = (fullName, entry, redact = false) => {
    let value = null;
    try { value = Services.prefs.getPrefType(fullName) === Services.prefs.PREF_STRING ? Services.prefs.getStringPref(fullName) : Zotero.Prefs.get(fullName.replace(/^extensions\.zotero\./, '')); } catch (e) { value = null; }
    return redact ? { equalToBaseline: value === entry?.value, chars: typeof value === 'string' ? value.length : null, user: Services.prefs.prefHasUserValue(fullName) } : { value, user: Services.prefs.prefHasUserValue(fullName) };
  };
  const summaries = {};
  for (const [suffix, entry] of Object.entries(base.prefs)) {
    const fullName = suffix === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + suffix;
    summaries[suffix] = read(fullName, entry, suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices' || suffix === 'readAloud.favoriteVoices');
  }
  const currentReaders = [];
  const list = Zotero.Reader._readers || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i]; const m = r?._internalReader?._readAloudManager;
    currentReaders.push({ index: i, fixture: fixtureIDs.includes(r?.itemID), active: !!m?.active, paused: m ? !!m.paused : null, selected: !!m?.selectedVoiceID, tier: m?._selectedTier ?? null });
  }
  const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const remainingItems = fixtureIDs.filter(id => !!Zotero.Items.get(id));
  const remainingReaders = (Zotero.Reader._readers || []).filter(r => fixtureIDs.includes(r?.itemID)).length;
  const result = { readersClosed, erased, fixtureReadersRemaining: remainingReaders, fixtureItemsRemaining: remainingItems.length, currentReaders, prefs: summaries, position: { rows: position.database?.rows ?? null, queued: position.store?.queued ?? null, lastError: position.store?.lastError ?? null }, debugStoring: !!Zotero.Debug.storing };
  delete Zotero.__ztts95NativeState;
  delete Zotero.__ztts95Fixture;
  delete Zotero.__ztts95FixtureB;
  delete Zotero.__ztts95Baseline;
  return JSON.stringify(result, null, 1);
})()
