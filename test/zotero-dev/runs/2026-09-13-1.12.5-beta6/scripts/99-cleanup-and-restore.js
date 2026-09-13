return (async () => {
  const root = Zotero.__ztts95Kokoro;
  const base = root?.baseline ?? root;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const out = { reader: null, item: null, restored: {}, final: {}, errors: [] };
  if (!base?.prefs) return JSON.stringify({ status: 'FAIL', error: 'baseline is missing' }, null, 1);
  const fixtureIDs = [root?.fixtureA?.itemID, root?.fixtureB?.itemID].filter(Boolean);
  for (const itemID of fixtureIDs) {
    const reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
    if (!reader) { out.reader ??= []; (out.reader).push({ itemID, absent: true }); continue; }
    try { if (reader._internalReader?._state?.readAloudState?.popupOpen) reader._internalReader.toggleReadAloudPopup(false); } catch (e) { out.errors.push('popup ' + itemID + ': ' + String(e)); }
    try { await Promise.resolve(reader.close?.()); } catch (e) { out.errors.push('close ' + itemID + ': ' + String(e)); }
    for (let i = 0; i < 60; i++) {
      if (!(Zotero.Reader._readers || []).some(r => r?.itemID === itemID)) break;
      await sleep(100);
    }
    out.reader ??= [];
    out.reader.push({ itemID, remaining: (Zotero.Reader._readers || []).some(r => r?.itemID === itemID) });
  }
  for (const itemID of fixtureIDs) {
    try {
      const item = Zotero.Items.get(itemID);
      if (item) { await item.eraseTx(); out.item ??= []; (out.item).push({ itemID, erased: true }); }
      else { out.item ??= []; (out.item).push({ itemID, erased: false, absent: true }); }
    } catch (e) { out.errors.push('erase ' + itemID + ': ' + String(e)); }
  }
  const prefix = 'extensions.zotero.zotero-tts.';
  const restore = (name, entry) => {
    if (!entry) return;
    if (!entry.user) { if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name); return; }
    if (typeof entry.value === 'boolean') Services.prefs.setBoolPref(name, entry.value);
    else if (Number.isInteger(entry.value)) Services.prefs.setIntPref(name, entry.value);
    else if (typeof entry.value === 'string') Services.prefs.setStringPref(name, entry.value);
  };
  const read = (name, entry, redact = false) => {
    let value = null;
    try { value = Services.prefs.getPrefType(name) === Services.prefs.PREF_STRING ? Services.prefs.getStringPref(name) : Zotero.Prefs.get(name.replace(/^extensions\.zotero\./, '')); } catch (e) {}
    return redact ? { equalToBaseline: value === entry?.value, chars: typeof value === 'string' ? value.length : null, user: Services.prefs.prefHasUserValue(name) }
      : { value, user: Services.prefs.prefHasUserValue(name) };
  };
  // Keep transport switches off until all temporary voice and memory state is
  // restored, then restore sync as the final preference writes.
  for (const [suffix, entry] of Object.entries(base.prefs)) {
    if (suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices' || suffix === 'webdav.syncPositions'
      || suffix === 'webdav.autoUploadSettings' || suffix === 'webdav.syncSettings') continue;
    restore(prefix + suffix, entry);
  }
  restore('extensions.zotero.reader.readAloudVoices', base.prefs['reader.readAloudVoices']);
  restore(prefix + 'readAloud.memory', base.prefs['readAloud.memory']);
  await sleep(500);
  for (const suffix of ['webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings']) restore(prefix + suffix, base.prefs[suffix]);
  await sleep(500);
  const mw = Zotero.getMainWindow?.() ?? Services.wm.getMostRecentWindow('navigator:browser');
  const selectedBefore = mw?.Zotero_Tabs?.selectedID ?? null;
  const selectedTarget = base.main?.selectedID ?? null;
  let tabError = null;
  try { if (selectedTarget) Zotero_Tabs.select(selectedTarget); } catch (e) { tabError = String(e); out.errors.push('tab: ' + tabError); }
  out.restored.selectedTab = { before: selectedBefore, target: selectedTarget, after: mw?.Zotero_Tabs?.selectedID ?? null, error: tabError };
  for (const [suffix, entry] of Object.entries(base.prefs)) {
    const name = suffix === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + suffix;
    out.restored[suffix] = read(name, entry, suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices'
      || suffix === 'readAloud.favoriteVoices' || suffix === 'local.headers');
  }
  const readers = [];
  for (const reader of Zotero.Reader._readers || []) {
    const m = reader?._internalReader?._readAloudManager, c = m?._controller;
    let title = null; try { const item = Zotero.Items.get(reader.itemID); title = (item?.parentItem ?? item)?.getField('title') ?? null; } catch (e) {}
    readers.push({ itemID: reader.itemID, title, fixture: fixtureIDs.includes(reader.itemID), active: !!m?.active, paused: m ? !!m.paused : null,
      selected: m?.selectedVoiceID ?? null, position: Number.isFinite(c?._position) ? c._position : null,
      audioState: c?._audioContext?.state ?? null, audioTime: Number.isFinite(c?._audioContext?.currentTime) ? c._audioContext.currentTime : null });
  }
  let position = null; try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { out.errors.push('position: ' + String(e)); }
  out.final = { fixtureReadersRemaining: readers.filter(r => r.fixture).length, fixtureItemsRemaining: fixtureIDs.filter(id => !!Zotero.Items.get(id)).length,
    settingsWindowOpen: !!Services.wm.getMostRecentWindow('zotero:pref'), readers,
    position: { rows: position?.database?.rows ?? null, queued: position?.store?.queued ?? null, lastError: position?.store?.lastError ?? null },
    debugStoring: !!Zotero.Debug.storing };
  return JSON.stringify(out, null, 1);
})()
