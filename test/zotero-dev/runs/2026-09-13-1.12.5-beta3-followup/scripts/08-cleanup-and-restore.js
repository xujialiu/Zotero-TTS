return (async () => {
  const root = Zotero.__ztts95Followup;
  if (!root?.baseline?.prefs) throw new Error('follow-up baseline is missing');
  const base = root.baseline;
  const prefix = 'extensions.zotero.zotero-tts.';
  const out = { fixtures: {}, restored: {}, errors: [] };
  const sleep = root.sleep;
  for (const key of ['a', 'b']) {
    const fixture = root.fixtures[key];
    const reader = fixture.reader;
    const internal = reader?._internalReader;
    const manager = internal?._readAloudManager;
    if (manager) {
      fixture.delayMs = 0; fixture.delayVoiceID = null; fixture.failVoiceID = null; fixture.failNext = false; fixture.noTimestamps = false;
      try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push(key + ': pause ' + String(e)); }
      try { if (internal?._state?.readAloudState?.popupOpen) internal.toggleReadAloudPopup(false); } catch (e) { out.errors.push(key + ': popup ' + String(e)); }
    }
  }
  // Let delayed fixture responses settle while their controllers are still
  // alive, so no stale result survives the reader close.
  await sleep(750);
  for (const key of ['a', 'b']) {
    const fixture = root.fixtures[key];
    const reader = fixture.reader;
    const internal = reader?._internalReader;
    const manager = internal?._readAloudManager;
    let restoredSlots = false, restoredCallbacks = false, restoredMethod = false;
    if (reader && internal && manager) {
      try {
        const options = Components.utils.waiveXrays(manager._options);
        const internalWaived = Components.utils.waiveXrays(internal);
        if (fixture.originalSlots) {
          options.remoteInterface = fixture.originalSlots.options;
          internalWaived._readAloudRemoteInterface = fixture.originalSlots.internal;
          restoredSlots = options.remoteInterface === fixture.originalSlots.options && internalWaived._readAloudRemoteInterface === fixture.originalSlots.internal;
        }
        if (fixture.originalStatusCallback) options.onSetReadAloudStatus = fixture.originalStatusCallback;
        if (fixture.originalInternalStatusCallback) internalWaived._onSetReadAloudStatus = fixture.originalInternalStatusCallback;
        restoredCallbacks = (!fixture.statusGuard || options.onSetReadAloudStatus !== fixture.statusGuard) && (!fixture.statusGuardInternal || internalWaived._onSetReadAloudStatus !== fixture.statusGuardInternal);
      } catch (e) { out.errors.push(key + ': slots ' + String(e)); }
      try {
        if (fixture.originalMethod) Object.defineProperty(reader, '_getReadAloudRemoteInterface', fixture.originalMethod);
        else delete reader._getReadAloudRemoteInterface;
        restoredMethod = fixture.originalMethod ? Object.getOwnPropertyDescriptor(reader, '_getReadAloudRemoteInterface')?.value === fixture.originalMethod.value : !Object.prototype.hasOwnProperty.call(reader, '_getReadAloudRemoteInterface');
      } catch (e) { out.errors.push(key + ': method ' + String(e)); }
    }
    let closeError = null;
    if (reader) {
      try { await Promise.resolve(reader.close?.()); } catch (e) { closeError = String(e); out.errors.push(key + ': close ' + closeError); }
    }
    for (let i = 0; i < 60; i++) {
      if (!(Zotero.Reader._readers || []).some(r => r?.itemID === fixture.itemID)) break;
      await sleep(100);
    }
    const remainingReader = (Zotero.Reader._readers || []).some(r => r?.itemID === fixture.itemID);
    let erased = false, eraseError = null;
    try {
      const item = Zotero.Items.get(fixture.itemID);
      if (item) { await item.eraseTx(); erased = true; }
    } catch (e) { eraseError = String(e); out.errors.push(key + ': erase ' + eraseError); }
    out.fixtures[key] = { itemID: fixture.itemID, key: fixture.key, restoredSlots, restoredCallbacks, restoredMethod, closeError, remainingReader, erased, remainingItem: !!Zotero.Items.get(fixture.itemID) };
  }
  // Keep WebDAV transport disabled until both temporary memory values and the
  // native per-language map have been restored. Restore those two values before
  // the transport switches, so a test voice cannot be uploaded.
  const memoryEntry = base.prefs['readAloud.memory'];
  const nativeEntry = base.prefs['reader.readAloudVoices'];
  root.restorePref(prefix + 'readAloud.memory', memoryEntry);
  root.restorePref('extensions.zotero.reader.readAloudVoices', nativeEntry);
  for (const [suffix, entry] of Object.entries(base.prefs)) {
    if (suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices' || suffix === 'webdav.syncPositions' || suffix === 'webdav.autoUploadSettings' || suffix === 'webdav.syncSettings') continue;
    root.restorePref(prefix + suffix, entry);
  }
  await sleep(350);
  for (const suffix of ['webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings']) root.restorePref(prefix + suffix, base.prefs[suffix]);
  if (base.debugStoring && !Zotero.Debug.storing) Zotero.Debug.setStore(true);
  if (!base.debugStoring && Zotero.Debug.storing && typeof Zotero.Debug.setStore === 'function') Zotero.Debug.setStore(false);
  const readPref = (fullName, entry, redact = false) => {
    let value = null;
    try { value = Services.prefs.getPrefType(fullName) === Services.prefs.PREF_STRING ? Services.prefs.getStringPref(fullName) : Zotero.Prefs.get(fullName.replace(/^extensions\.zotero\./, '')); } catch (e) {}
    if (redact) return { equalToBaseline: value === entry?.value, chars: typeof value === 'string' ? value.length : null, user: Services.prefs.prefHasUserValue(fullName) };
    return { value, user: Services.prefs.prefHasUserValue(fullName) };
  };
  for (const [suffix, entry] of Object.entries(base.prefs)) {
    const fullName = suffix === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + suffix;
    out.restored[suffix] = readPref(fullName, entry, suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices' || suffix === 'readAloud.favoriteVoices');
  }
  const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const readers = [];
  for (const reader of Zotero.Reader._readers || []) {
    const manager = reader?._internalReader?._readAloudManager;
    readers.push({ itemID: reader?.itemID ?? null, fixture: reader?.itemID === root.fixtures.a.itemID || reader?.itemID === root.fixtures.b.itemID, active: !!manager?.active, paused: manager ? !!manager.paused : null, selected: manager?.selectedVoiceID ?? null, position: Number.isFinite(manager?._controller?._position) ? manager._controller._position : null });
  }
  out.final = {
    fixtureReadersRemaining: readers.filter(r => r.fixture).length,
    fixtureItemsRemaining: ['a', 'b'].filter(k => !!Zotero.Items.get(root.fixtures[k].itemID)).length,
    readers,
    position: { rows: position.database?.rows ?? null, queued: position.store?.queued ?? null, lastError: position.store?.lastError ?? null },
    debugStoring: !!Zotero.Debug.storing,
  };
  delete Zotero.__ztts95Followup;
  return JSON.stringify(out, null, 1);
})()
