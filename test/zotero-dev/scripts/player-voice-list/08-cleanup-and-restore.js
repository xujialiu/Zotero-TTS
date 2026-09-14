return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, base = state.baseline, transport = state.transport;
  if (!base?.prefs || !state.fixtures) throw new Error('baseline or fixtures are missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const closeRows = [];
  for (const fixture of state.fixtures) {
    let reader = null; const rs = Zotero.Reader._readers || [];
    for (let i = 0; i < rs.length; i++) if (rs[i]?.itemID === fixture.itemID) { reader = rs[i]; break; }
    if (!reader) { closeRows.push({ kind: fixture.kind, itemID: fixture.itemID, absent: true }); continue; }
    try { reader._internalReader?.toggleReadAloudPopup(false); } catch (e) {}
    try {
      const entry = transport?.readers?.[fixture.kind], manager = reader._internalReader?._readAloudManager, internal = reader._internalReader;
      const options = manager?._options;
      if (entry?.originalRemote && options) Components.utils.waiveXrays(options).remoteInterface = entry.originalRemote;
      if (entry?.originalInternalRemote && internal) Components.utils.waiveXrays(internal)._readAloudRemoteInterface = entry.originalInternalRemote;
    } catch (e) {}
    try { reader.close?.(); } catch (e) {}
    let absent = false;
    for (let i = 0; i < 60; i++) { await sleep(100); const current = Zotero.Reader._readers || []; absent = true; for (let j = 0; j < current.length; j++) if (current[j]?.itemID === fixture.itemID) { absent = false; break; } if (absent) break; }
    closeRows.push({ kind: fixture.kind, itemID: fixture.itemID, absent });
  }
  if (transport?.proto && transport.original) { try { transport.proto._getReadAloudRemoteInterface = transport.original; transport.restored = transport.proto._getReadAloudRemoteInterface === transport.original; } catch (e) { transport.restoreError = String(e); } }
  const erased = [];
  for (const fixture of state.fixtures) {
    const item = Zotero.Items.get(fixture.itemID); if (!item) { erased.push({ kind: fixture.kind, absent: true }); continue; }
    try { await item.eraseTx(); erased.push({ kind: fixture.kind, erased: true }); } catch (e) { erased.push({ kind: fixture.kind, erased: false, error: String(e) }); }
  }
  const restore = (full, entry) => {
    if (!entry?.user) { if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full); return; }
    if (typeof entry.value === 'boolean') Services.prefs.setBoolPref(full, entry.value);
    else if (Number.isInteger(entry.value)) Services.prefs.setIntPref(full, entry.value);
    else if (typeof entry.value === 'string') Services.prefs.setStringPref(full, entry.value);
  };
  const prefix = 'extensions.zotero.zotero-tts.';
  restore(prefix + 'readAloud.volume', base.prefs['readAloud.volume']);
  for (const [suffix, entry] of Object.entries(base.prefs)) if (!['readAloud.volume', 'readAloud.memory', 'reader.readAloudVoices', 'webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings'].includes(suffix)) restore(prefix + suffix, entry);
  restore('extensions.zotero.reader.readAloudVoices', base.prefs['reader.readAloudVoices']);
  restore(prefix + 'readAloud.memory', base.prefs['readAloud.memory']);
  for (const suffix of ['webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings']) restore(prefix + suffix, base.prefs[suffix]);
  await sleep(600);
  try { if (!!Zotero.Debug.storing !== !!base.debugStoring) Zotero.Debug.setStore(!!base.debugStoring); } catch (e) {}
  const prefCheck = {};
  for (const [suffix, entry] of Object.entries(base.prefs)) {
    const full = suffix === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + suffix;
    let value = null; try { value = Zotero.Prefs.get(full.replace(/^extensions\.zotero\./, '')); } catch (e) {}
    prefCheck[suffix] = { equal: value === entry.value, user: Services.prefs.prefHasUserValue(full), userEqual: Services.prefs.prefHasUserValue(full) === entry.user,
      secret: ['readAloud.memory', 'readAloud.favoriteVoices', 'reader.readAloudVoices'].includes(suffix), chars: typeof value === 'string' ? value.length : null };
  }
  let selectedTabRestored = false; try { if (base.selectedTabID) { Zotero.getMainWindow()?.Zotero_Tabs?.select(base.selectedTabID); await sleep(250); selectedTabRestored = Zotero.getMainWindow()?.Zotero_Tabs?.selectedID === base.selectedTabID; } } catch (e) {}
  const currentReaders = [], current = Zotero.Reader._readers || [];
  for (let i = 0; i < current.length; i++) { const r = current[i], m = r?._internalReader?._readAloudManager; currentReaders.push({ itemID: r.itemID, tabID: r.tabID, active: !!m?.active, paused: m?.paused ?? null, voice: m?.selectedVoiceID ?? null, tier: m?._selectedTier ?? null, position: Number.isFinite(m?._controller?._position) ? m._controller._position : null }); }
  const expectedOwner = base.readers.filter(r => !state.fixtures.some(f => f.itemID === r.itemID)).map(r => ({ itemID: r.itemID, tabID: r.tabID, active: r.active, paused: r.paused, voice: r.voice, tier: r.tier, position: r.position }));
  const actualOwner = currentReaders.filter(r => expectedOwner.some(e => e.itemID === r.itemID));
  const ownerStable = JSON.stringify(expectedOwner) === JSON.stringify(actualOwner);
  let position = null; try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { position = { error: String(e) }; }
  let debugText = ''; try { debugText = String(await Zotero.Debug.get()); } catch (e) {}
  const pluginLines = debugText.split('\n').filter(line => /zotero-tts|zotero\.tts/i.test(line));
  const result = { closeRows, erased, fixtureReadersRemaining: currentReaders.filter(r => state.fixtures.some(f => f.itemID === r.itemID)).length,
    fixtureItemsRemaining: state.fixtures.filter(f => !!Zotero.Items.get(f.itemID)).length, ownerStable, expectedOwner, actualOwner,
    selectedTab: { expected: base.selectedTabID ?? null, actual: Zotero.getMainWindow()?.Zotero_Tabs?.selectedID ?? null, restored: selectedTabRestored },
    prefs: prefCheck, debugStoring: !!Zotero.Debug.storing, transportRestored: !!transport?.restored,
    position: { rows: position.database?.rows ?? null, queued: position.store?.queued ?? null, lastError: position.store?.lastError ?? null },
    debug: { pluginLineCount: pluginLines.length, deadObjectLineCount: debugText.split('\n').filter(line => /can't access dead object/i.test(line)).length } };
  state.cleanup = result;
  delete state.transport; delete state.fixtures; delete state.baseline; delete state.liveResult; delete state.fallbackResult;
  return JSON.stringify(result, null, 1);
})()
