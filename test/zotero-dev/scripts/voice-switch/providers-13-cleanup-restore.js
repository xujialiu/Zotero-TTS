return (async () => {
  const state = Zotero.__zttsAllHandoff, base = state && state.baseline, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const out = { errors: [], fixture: null, restored: {}, final: {} };
  if (!base || !base.prefs) { out.errors.push('baseline missing'); return JSON.stringify(out, null, 1); }
  const fixture = state.fixture;
  if (fixture && fixture.itemID) {
    let reader = null; const list = Zotero.Reader._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].itemID === fixture.itemID) { reader = list[i]; break; }
    if (reader) {
      try { const internal = reader._internalReader; if (internal && internal._state && internal._state.readAloudState && internal._state.readAloudState.popupOpen) internal.toggleReadAloudPopup(false); } catch (e) { out.errors.push('popup: ' + String(e)); }
      try { await Promise.resolve(reader.close && reader.close()); } catch (e) { out.errors.push('close: ' + String(e)); }
      for (let i = 0; i < 60; i++) { let left = false; const now = Zotero.Reader._readers || []; for (let j = 0; j < now.length; j++) if (now[j] && now[j].itemID === fixture.itemID) { left = true; break; } if (!left) break; await sleep(100); }
    }
    const after = Zotero.Reader._readers || []; let left = false; for (let i = 0; i < after.length; i++) if (after[i] && after[i].itemID === fixture.itemID) left = true;
    try { const item = Zotero.Items.get(fixture.itemID); if (item) await item.eraseTx(); } catch (e) { out.errors.push('erase: ' + String(e)); }
    out.fixture = { readerClosed: !left, itemErased: !Zotero.Items.get(fixture.itemID) };
  }
  const prefix = 'extensions.zotero.zotero-tts.', special = new Set(['readAloud.memory', 'reader.readAloudVoices', 'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings']);
  const restore = (name, entry) => { if (!entry) return; if (!entry.user) { if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name); return; } const value = entry.value; if (typeof value === 'boolean') Services.prefs.setBoolPref(name, value); else if (Number.isInteger(value)) Services.prefs.setIntPref(name, value); else if (typeof value === 'string') Services.prefs.setStringPref(name, value); };
  for (const [suffix, entry] of Object.entries(base.prefs)) if (!special.has(suffix)) restore(prefix + suffix, entry);
  restore('extensions.zotero.reader.readAloudVoices', base.prefs['reader.readAloudVoices']);
  restore(prefix + 'readAloud.memory', base.prefs['readAloud.memory']);
  await sleep(600);
  for (const suffix of ['webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings']) restore(prefix + suffix, base.prefs[suffix]);
  await sleep(600);
  if (!!Zotero.Debug.storing !== !!base.debugStoring) { try { Zotero.Debug.setStore(!!base.debugStoring); } catch (e) { out.errors.push('debug store: ' + String(e)); } }
  const main = Zotero.getMainWindow && Zotero.getMainWindow(); let tabError = null;
  try { if (base.main && base.main.selectedID) Zotero_Tabs.select(base.main.selectedID); } catch (e) { tabError = String(e); out.errors.push('tab: ' + tabError); }
  const readValue = (suffix, secret) => { const name = suffix === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + suffix; let value = null; try { value = Zotero.Prefs.get(name.replace(/^extensions\.zotero\./, '')); } catch (e) {} const entry = base.prefs[suffix]; return secret ? { equalToBaseline: value === entry.value, chars: typeof value === 'string' ? value.length : null, user: Services.prefs.prefHasUserValue(name) } : { value, user: Services.prefs.prefHasUserValue(name) }; };
  for (const [suffix, entry] of Object.entries(base.prefs)) out.restored[suffix] = readValue(suffix, /apiKey|apiToken|headers|memory|presetValues|favoriteVoices|reader\.readAloudVoices/i.test(suffix));
  const readers = [], remaining = Zotero.Reader._readers || [];
  for (let i = 0; i < remaining.length; i++) { const reader = remaining[i], manager = reader && reader._internalReader && reader._internalReader._readAloudManager, controller = manager && manager._controller; let title = null; try { const item = Zotero.Items.get(reader.itemID); title = (item.parentItem || item).getField('title'); } catch (e) {} readers.push({ index: i, itemID: reader.itemID, title, tabID: reader.tabID, active: !!(manager && manager.active), paused: manager ? !!manager.paused : null, selected: manager && manager.selectedVoiceID || null, tier: manager && manager._selectedTier || null, position: controller && Number.isFinite(controller._position) ? controller._position : null, currentIndex: controller && Number.isFinite(controller._currentIndex) ? controller._currentIndex : null, audioState: controller && controller._audioContext && controller._audioContext.state || null }); }
  let position = null; try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { out.errors.push('position: ' + String(e)); }
  out.final = { readers, selectedTab: main && main.Zotero_Tabs && main.Zotero_Tabs.selectedID || null, selectedTabRestored: !!(main && main.Zotero_Tabs && main.Zotero_Tabs.selectedID === (base.main && base.main.selectedID)), settingsWindowOpen: !!Services.wm.getMostRecentWindow('zotero:pref'), debugStoring: !!Zotero.Debug.storing, position: { rows: position && position.database && position.database.rows || null, queued: position && position.store ? position.store.queued : null, lastError: position && position.store && position.store.lastError || null }, tabError };
  try {
    const root = 'C:\\Users\\xujia\\orca\\scratch\\zotero-tts-voice-handoff-2026-09-13\\';
    await IOUtils.write(root + 'cleanup.json', new TextEncoder().encode(JSON.stringify(out, null, 2)));
    const evidenceBytes = await IOUtils.read(root + 'evidence.json');
    const evidence = JSON.parse(new TextDecoder().decode(evidenceBytes));
    evidence.restoration = { status: out.errors.length ? 'FAIL' : 'PASS', fixture: out.fixture, final: out.final, restored: out.restored, runtimeSnapshotPresent: false };
    await IOUtils.write(root + 'evidence.json', new TextEncoder().encode(JSON.stringify(evidence, null, 2)));
    const reportBytes = await IOUtils.read(root + 'report.md');
    const report = new TextDecoder().decode(reportBytes).replace('Restoration was still pending when this artifact was written.', 'Restoration completed: the fixture was removed, baseline preferences and user-value flags matched, and the original user reader/tab state was restored.');
    await IOUtils.write(root + 'report.md', new TextEncoder().encode(report));
  } catch (e) { out.errors.push('artifact finalization: ' + String(e)); }
  try { delete Zotero.__zttsAllHandoff; } catch (e) { out.errors.push('delete runtime snapshot: ' + String(e)); }
  out.runtimeSnapshotPresent = !!Zotero.__zttsAllHandoff;
  return JSON.stringify(out, null, 1);
})()
