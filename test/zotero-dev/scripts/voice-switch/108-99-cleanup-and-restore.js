return (async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const base = state.baseline;
  const transport = state.transport;
  if (!base?.prefs || !state.fixtures) throw new Error('108 baseline or fixtures are missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fixtureRows = [];
  const deadObjectErrors = [];
  const consoleListener = { observe(message) {
    const text = String(message.message || '');
    if (text.includes('dead object') && text.includes('zotero-tts')) deadObjectErrors.push(text.slice(0,300));
  } };
  Services.console.registerListener(consoleListener);
  for (const fixture of state.fixtures) {
    let reader = null;
    const rows = Zotero.Reader._readers || [];
    for (let i = 0; i < rows.length; i++) if (rows[i]?.itemID === fixture.itemID) { reader = rows[i]; break; }
    if (!reader) { fixtureRows.push({ kind: fixture.kind, itemID: fixture.itemID, absent: true }); continue; }
    const notice = reader._iframeWindow?.document?.getElementById('ztts-speed-toast');
    const noticeVisibleOnClose = notice?.style?.opacity === '1';
    try { reader._internalReader?.toggleReadAloudPopup(false); } catch (e) {}
    try {
      const entry = transport?.readers?.[fixture.kind];
      const manager = reader._internalReader?._readAloudManager;
      const options = manager?._options;
      if (entry?.originalRemote && options) Components.utils.waiveXrays(options).remoteInterface = entry.originalRemote;
      if (entry?.originalInternalRemote && reader._internalReader) Components.utils.waiveXrays(reader._internalReader)._readAloudRemoteInterface = entry.originalInternalRemote;
    } catch (e) {}
    try { reader.close?.(); } catch (e) {}
    let absent = false;
    for (let i = 0; i < 60; i++) {
      await sleep(100);
      const current = Zotero.Reader._readers || [];
      absent = true;
      for (let j = 0; j < current.length; j++) if (current[j]?.itemID === fixture.itemID) { absent = false; break; }
      if (absent) break;
    }
    fixtureRows.push({ kind: fixture.kind, itemID: fixture.itemID, absent, noticeVisibleOnClose });
  }
  // Voice notices hide after five seconds, even if their reader was closed.
  await sleep(5500);
  Services.console.unregisterListener(consoleListener);
  let transportRestored = false;
  if (transport?.proto && transport.original) {
    try { transport.proto._getReadAloudRemoteInterface = transport.original; transportRestored = transport.proto._getReadAloudRemoteInterface === transport.original; }
    catch (e) { transport.restoreError = String(e); }
  }
  const erased = [];
  for (const fixture of state.fixtures) {
    const item = Zotero.Items.get(fixture.itemID);
    if (!item) { erased.push({ kind: fixture.kind, absent: true }); continue; }
    try { await item.eraseTx(); erased.push({ kind: fixture.kind, erased: true }); }
    catch (e) { erased.push({ kind: fixture.kind, erased: false, error: String(e) }); }
  }
  const prefix = 'extensions.zotero.zotero-tts.';
  const restore = (name, entry) => {
    if (!entry?.user) { if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name); return; }
    if (typeof entry.value === 'boolean') Services.prefs.setBoolPref(name, entry.value);
    else if (Number.isInteger(entry.value)) Services.prefs.setIntPref(name, entry.value);
    else if (typeof entry.value === 'string') Services.prefs.setStringPref(name, entry.value);
  };
  // Keep sync/upload disabled while fixture-specific voice state is gone.
  restore(prefix + 'readAloud.volume', base.prefs['readAloud.volume']);
  for (const [suffix, entry] of Object.entries(base.prefs)) {
    if (suffix === 'readAloud.volume' || suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices'
      || suffix === 'webdav.syncPositions' || suffix === 'webdav.syncSettings' || suffix === 'webdav.autoUploadSettings') continue;
    restore(suffix === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + suffix, entry);
  }
  restore('extensions.zotero.reader.readAloudVoices', base.prefs['reader.readAloudVoices']);
  // The memory write is deliberately last among the voice state writes.
  restore(prefix + 'readAloud.memory', base.prefs['readAloud.memory']);
  for (const suffix of ['webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings']) restore(prefix + suffix, base.prefs[suffix]);
  await sleep(600);
  try { if (!!Zotero.Debug.storing !== !!base.debugStoring) Zotero.Debug.setStore(!!base.debugStoring); } catch (e) {}
  const prefCheck = {};
  for (const [suffix, entry] of Object.entries(base.prefs)) {
    const name = suffix === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + suffix;
    let value = null;
    try { value = Zotero.Prefs.get(name.replace(/^extensions\.zotero\./, '')); } catch (e) {}
    const secret = suffix === 'readAloud.memory' || suffix === 'readAloud.favoriteVoices' || suffix === 'reader.readAloudVoices'
      || suffix.endsWith('.headers') || suffix.endsWith('.baseURL');
    prefCheck[suffix] = {
      equal: value === entry.value, userEqual: Services.prefs.prefHasUserValue(name) === entry.user,
      user: Services.prefs.prefHasUserValue(name), chars: typeof value === 'string' ? value.length : null, secret,
    };
  }
  let selectedTabRestored = false;
  try {
    if (base.selectedTabID) {
      Zotero.getMainWindow?.().Zotero_Tabs?.select(base.selectedTabID);
      await sleep(250);
      selectedTabRestored = Zotero.getMainWindow?.().Zotero_Tabs?.selectedID === base.selectedTabID;
    }
  } catch (e) {}
  const currentReaders = [];
  const current = Zotero.Reader._readers || [];
  for (let i = 0; i < current.length; i++) {
    const reader = current[i], manager = reader?._internalReader?._readAloudManager;
    currentReaders.push({ itemID: reader.itemID, tabID: reader.tabID, active: !!manager?.active, paused: manager?.paused ?? null,
      voice: manager?.selectedVoiceID ?? null, tier: manager?._selectedTier ?? null,
      position: Number.isFinite(manager?._controller?._position) ? manager._controller._position : null });
  }
  const ownerExpected = base.readers.filter(row => !state.fixtures.some(f => f.itemID === row.itemID)).map(row => ({
    itemID: row.itemID, tabID: row.tabID, active: row.active, paused: row.paused, voice: row.voice, tier: row.tier, position: row.position,
  }));
  const ownerActual = currentReaders.filter(row => ownerExpected.some(expected => expected.itemID === row.itemID));
  const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const result = {
    status: fixtureRows.every(row => row.absent) && erased.every(row => row.erased || row.absent) && transportRestored && selectedTabRestored
      && JSON.stringify(ownerExpected) === JSON.stringify(ownerActual)
      && deadObjectErrors.length === 0
      && Object.values(prefCheck).every(row => row.equal && row.userEqual) ? 'PASS' : 'FAIL',
    fixtureRows, erased, deadObjectErrors, fixtureReadersRemaining: currentReaders.filter(row => state.fixtures.some(f => f.itemID === row.itemID)).length,
    fixtureItemsRemaining: state.fixtures.filter(f => !!Zotero.Items.get(f.itemID)).length,
    transportRestored, ownerStable: JSON.stringify(ownerExpected) === JSON.stringify(ownerActual), selectedTabRestored,
    prefs: prefCheck, debugStoring: !!Zotero.Debug.storing,
    position: { rows: position.database?.rows ?? null, queued: position.store?.queued ?? null, lastError: position.store?.lastError ?? null },
  };
  state.cleanup = result;
  delete state.transport; delete state.fixtures; delete state.baseline;
  return JSON.stringify(result, null, 1);
})()
