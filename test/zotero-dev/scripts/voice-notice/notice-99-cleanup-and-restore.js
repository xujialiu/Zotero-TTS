return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, base = state.baseline, t = state.transport, Cu = Components.utils;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const started = Date.now(), newErrors = [];
  const listener = { observe(message) { const text = String(message.message || ''); if (/zotero-tts|dead object/i.test(text)) newErrors.push({ at: Date.now(), text: text.slice(0, 300) }); } };
  Services.console.registerListener(listener);
  const fixtureIDs = (state.fixtures || []).map(row => row.itemID);
  const currentReader = itemID => { const rows = Zotero.Reader._readers || []; for (let i = 0; i < rows.length; i++) if (rows[i]?.itemID === itemID) return rows[i]; return null; };
  const closed = [];
  for (const fixture of state.fixtures || []) {
    const reader = currentReader(fixture.itemID), entry = t?.readers?.[fixture.kind];
    if (!reader) { closed.push({ kind: fixture.kind, itemID: fixture.itemID, readerGone: true }); continue; }
    try {
      const m = reader._internalReader?._readAloudManager, options = m?._options;
      if (entry?.originalRemote && options) Cu.waiveXrays(options).remoteInterface = entry.originalRemote;
      if (entry?.originalInternalRemote && reader._internalReader) Cu.waiveXrays(reader._internalReader)._readAloudRemoteInterface = entry.originalInternalRemote;
    } catch (e) {}
    try { reader._internalReader?.toggleReadAloudPopup(false); } catch (e) {}
    try { reader.close?.(); } catch (e) {}
    closed.push({ kind: fixture.kind, itemID: fixture.itemID, readerGone: false });
  }
  for (let i = 0; i < 60; i++) { let remaining = false; for (const id of fixtureIDs) if (currentReader(id)) remaining = true; if (!remaining) break; await sleep(100); }
  const readersRemaining = []; const rows = Zotero.Reader._readers || [];
  for (let i = 0; i < rows.length; i++) if (fixtureIDs.includes(rows[i]?.itemID)) readersRemaining.push(rows[i]?.itemID);
  let transportRestored = false;
  try { if (t?.proto && t.original) { t.proto._getReadAloudRemoteInterface = t.original; transportRestored = t.proto._getReadAloudRemoteInterface === t.original; } } catch (e) {}
  const erased = [];
  for (const fixture of state.fixtures || []) { const item = Zotero.Items.get(fixture.itemID); if (!item) { erased.push({ kind: fixture.kind, itemID: fixture.itemID, erased: true, absent: true }); continue; } try { await item.eraseTx(); erased.push({ kind: fixture.kind, itemID: fixture.itemID, erased: true }); } catch (e) { erased.push({ kind: fixture.kind, itemID: fixture.itemID, erased: false, error: String(e) }); } }
  // Let a persistent close-time notice and its timer settle before auditing
  // the console. This is the live dead-object window in the case file.
  await sleep(5500); Services.console.unregisterListener(listener);
  const prefix = 'extensions.zotero.zotero-tts.';
  const restore = (name, entry) => {
    if (!entry?.user) { if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name); return; }
    if (typeof entry.value === 'boolean') Services.prefs.setBoolPref(name, entry.value);
    else if (Number.isInteger(entry.value)) Services.prefs.setIntPref(name, entry.value);
    else if (typeof entry.value === 'string') Services.prefs.setStringPref(name, entry.value);
  };
  restore(prefix + 'readAloud.volume', base.prefs['readAloud.volume']);
  for (const [suffix, entry] of Object.entries(base.prefs)) {
    if (suffix === 'readAloud.volume' || suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices'
      || suffix === 'webdav.syncPositions' || suffix === 'webdav.syncSettings' || suffix === 'webdav.autoUploadSettings') continue;
    restore(prefix + suffix, entry);
  }
  restore('extensions.zotero.reader.readAloudVoices', base.prefs['reader.readAloudVoices']);
  // The memory write is last among the voice state writes.
  restore(prefix + 'readAloud.memory', base.prefs['readAloud.memory']);
  for (const suffix of ['webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings']) restore(prefix + suffix, base.prefs[suffix]);
  await sleep(700);
  try { if (!!Zotero.Debug.storing !== !!base.debugStoring) Zotero.Debug.setStore(!!base.debugStoring); } catch (e) {}
  const prefCheck = {};
  for (const [suffix, entry] of Object.entries(base.prefs)) {
    const name = suffix === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + suffix; let value = null;
    try { value = Zotero.Prefs.get(name.replace(/^extensions\.zotero\./, '')); } catch (e) {}
    const secret = suffix === 'readAloud.memory' || suffix === 'readAloud.favoriteVoices' || suffix === 'reader.readAloudVoices' || suffix.endsWith('.headers') || suffix.endsWith('.baseURL');
    prefCheck[suffix] = { equal: value === entry.value, userEqual: Services.prefs.prefHasUserValue(name) === entry.user, user: Services.prefs.prefHasUserValue(name), chars: typeof value === 'string' ? value.length : null, secret };
  }
  let selectedTabRestored = false; const main = Zotero.getMainWindow?.();
  try { if (base.selectedTabID) { main?.Zotero_Tabs?.select(base.selectedTabID); await sleep(250); selectedTabRestored = main?.Zotero_Tabs?.selectedID === base.selectedTabID; } else selectedTabRestored = true; } catch (e) {}
  const ownerActual = []; const current = Zotero.Reader._readers || [];
  for (let i = 0; i < current.length; i++) { const r = current[i], m = r?._internalReader?._readAloudManager; if (!base.readers.some(row => row.itemID === r.itemID)) continue; ownerActual.push({ itemID: r.itemID, tabID: r.tabID, active: !!m?.active, paused: m?.paused ?? null, voice: m?.selectedVoiceID ?? null, tier: m?._selectedTier ?? null, position: Number.isFinite(m?._controller?._position) ? m._controller._position : null }); }
  const ownerExpected = base.readers.map(row => ({ itemID: row.itemID, tabID: row.tabID, active: row.active, paused: row.paused, voice: row.voice, tier: row.tier, position: row.position }));
  const ownerStable = JSON.stringify(ownerExpected) === JSON.stringify(ownerActual);
  const fixtureRows = (state.fixtures || []).map(f => ({ kind: f.kind, itemID: f.itemID, readerGone: !currentReader(f.itemID), itemGone: !Zotero.Items.get(f.itemID) }));
  const remainingNotices = []; for (let i = 0; i < current.length; i++) { const el = current[i]?._iframeWindow?.document?.getElementById('ztts-voice-notice'); if (el?.style?.opacity === '1') remainingNotices.push(current[i].itemID); }
  // The final state is deliberately taskbar-minimized per the confirmed
  // tester policy; selection and reader geometry are preserved separately.
  try { main?.minimize?.(); } catch (e) {}
  await sleep(150); const finalWindow = { windowState: main?.windowState ?? null, selectedTabID: main?.Zotero_Tabs?.selectedID ?? null, outerWidth: main?.outerWidth ?? null, outerHeight: main?.outerHeight ?? null, screenX: main?.screenX ?? null, screenY: main?.screenY ?? null };
  const result = { status: fixtureRows.every(row => row.readerGone && row.itemGone) && readersRemaining.length === 0 && erased.every(row => row.erased) && transportRestored && selectedTabRestored && ownerStable && Object.values(prefCheck).every(row => row.equal && row.userEqual) && remainingNotices.length === 0 && !newErrors.some(row => /dead object/i.test(row.text)) ? 'PASS' : 'FAIL', runStartedAt: started, closed, fixtureRows, erased, readersRemaining, remainingNotices, transportRestored, selectedTabRestored, ownerStable, ownerExpected, ownerActual, prefs: prefCheck, newErrors, debugStoring: !!Zotero.Debug.storing, finalWindow };
  state.cleanup = result; delete state.transport; delete state.fixtures; delete state.baseline;
  return JSON.stringify(result, null, 1);
})()
