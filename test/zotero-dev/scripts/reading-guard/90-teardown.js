return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const p = Services.prefs;
  const out = { status: 'FAIL', closed: [], erased: [], restore: [], errors: {} };
  const prefix = 'extensions.zotero.zotero-tts.';
  const restore = rec => {
    if (!rec) return;
    if (!rec.user) { if (p.prefHasUserValue(rec.key)) p.clearUserPref(rec.key); return; }
    if (rec.type === p.PREF_BOOL) p.setBoolPref(rec.key, !!rec.value);
    else if (rec.type === p.PREF_INT) p.setIntPref(rec.key, Number(rec.value));
    else if (rec.type === p.PREF_STRING) p.setStringPref(rec.key, String(rec.value));
  };
  const readCurrent = rec => {
    const type = p.getPrefType(rec.key), user = p.prefHasUserValue(rec.key); let value = null;
    try { value = type === p.PREF_BOOL ? p.getBoolPref(rec.key) : type === p.PREF_INT ? p.getIntPref(rec.key) : type === p.PREF_STRING ? p.getStringPref(rec.key) : null; } catch {}
    const equal = user === rec.user && value === rec.value;
    const secret = /headers|memory|Voices|favoriteVoices/i.test(rec.key);
    return secret ? { user, equal, present: typeof value === 'string' ? value.length > 0 : value !== null, chars: typeof value === 'string' ? value.length : null } : { user, equal, value };
  };
  const fixtures = state.fixtures || [], baseline = state.baseline?.prefs || {};
  try {
    // Close only disposable fixture players/tabs. The owner's player was
    // already closed for the provider checks and is never reopened here.
    for (const f of fixtures) {
      let reader = null; for (const r of Zotero.Reader._readers || []) if (r?.itemID === f.itemID) { reader = r; break; }
      let popupError = null, tabError = null;
      if (reader) {
        try { reader._internalReader?.toggleReadAloudPopup(false); } catch (e) { popupError = String(e); }
        await sleep(150);
        try { Zotero.getMainWindow?.().Zotero_Tabs?.close(reader.tabID); } catch (e) { tabError = String(e); }
        for (let i = 0; i < 200; i++) { let found = false; for (const r of Zotero.Reader._readers || []) if (r?.tabID === reader.tabID) found = true; if (!found) break; await sleep(50); }
      }
      let left = 0; for (const r of Zotero.Reader._readers || []) if (r?.itemID === f.itemID) left++;
      out.closed.push({ kind: f.kind, itemID: f.itemID, tabID: reader?.tabID || null, popupError, tabError, left });
      let erased = false, eraseError = null;
      try { const item = Zotero.Items.get(f.itemID); if (item) { await item.eraseTx(); erased = true; } else erased = true; } catch (e) { eraseError = String(e); }
      out.erased.push({ kind: f.kind, itemID: f.itemID, erased, eraseError });
    }
    await sleep(500);
    out.fixturesRemaining = [];
    for (const f of fixtures) { let item = null; try { item = Zotero.Items.get(f.itemID); } catch {} let reader = null; for (const r of Zotero.Reader._readers || []) if (r?.itemID === f.itemID) reader = r; if (item || reader) out.fixturesRemaining.push({ kind: f.kind, item: !!item, reader: !!reader }); }
    if (out.fixturesRemaining.length) throw new Error('fixture cleanup left items/readers: ' + JSON.stringify(out.fixturesRemaining));

    // Restore ordinary settings first. Volume and memory are restored before
    // the WebDAV switches, with the remembered voice and reader voice map
    // written last among voice state so observers cannot overwrite them.
    const memoryName = prefix + 'readAloud.memory', readerVoicesName = 'extensions.zotero.reader.readAloudVoices', volumeName = prefix + 'readAloud.volume';
    for (const rec of Object.values(baseline)) if (rec.key !== memoryName && rec.key !== readerVoicesName && rec.key !== volumeName && !/webdav\.(syncPositions|autoUploadSettings|syncSettings)$/.test(rec.key)) { try { restore(rec); } catch (e) { out.restore.push({ key: rec.key, error: String(e) }); } }
    if (baseline[Object.keys(baseline).find(k => baseline[k]?.key === volumeName)]) { const rec = Object.values(baseline).find(x => x.key === volumeName); try { restore(rec); } catch (e) { out.restore.push({ key: volumeName, error: String(e) }); } }
    const readerRec = Object.values(baseline).find(x => x.key === readerVoicesName); if (readerRec) { try { restore(readerRec); } catch (e) { out.restore.push({ key: readerVoicesName, error: String(e) }); } }
    const memoryRec = Object.values(baseline).find(x => x.key === memoryName); if (memoryRec) { try { restore(memoryRec); } catch (e) { out.restore.push({ key: memoryName, error: String(e) }); } }
    // Sync and backup are deliberately restored last, after all temporary
    // settings and fixture data are gone.
    for (const rec of Object.values(baseline)) if (/webdav\.(syncPositions|autoUploadSettings|syncSettings)$/.test(rec.key)) { try { restore(rec); } catch (e) { out.restore.push({ key: rec.key, error: String(e) }); } }
    await sleep(800);

    const prefAudit = {}; let prefMismatch = 0;
    for (const rec of Object.values(baseline)) { const row = readCurrent(rec); prefAudit[rec.key] = row; if (!row.equal) prefMismatch++; }
    out.preferenceAudit = prefAudit;
    out.preferenceMismatches = prefMismatch;
    if (prefMismatch) throw new Error('preference/user-value restoration mismatch: ' + JSON.stringify(Object.fromEntries(Object.entries(prefAudit).filter(([, x]) => !x.equal))));

    // Close the settings window if this run opened it; do not activate the
    // host merely to collect evidence, and leave it minimized by policy.
    const settings = Services.wm.getMostRecentWindow('zotero:pref'); if (settings) { try { settings.close(); } catch {} for (let i = 0; i < 100 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(50); }
    if (state.baseline?.selectedTabID) { try { Zotero.getMainWindow?.().Zotero_Tabs?.select(state.baseline.selectedTabID); } catch {} }
    const host = Services.wm.getMostRecentWindow('navigator:browser'); if (host && host.windowState !== 2) { try { host.minimize(); } catch {} } await sleep(350);
    out.window = host ? { windowState: host.windowState, minimized: host.windowState === 2, selectedTabID: globalThis.Zotero_Tabs?.selectedID || null } : null;
    out.readers = []; for (const r of Zotero.Reader._readers || []) { const m = r?._internalReader?._readAloudManager; out.readers.push({ itemID: r.itemID, tabID: r.tabID, active: !!m?.active, paused: !!m?.paused, popupOpen: !!r?._internalReader?._state?.readAloudState?.popupOpen }); }
    out.patches = JSON.parse(Zotero.ZoteroTTS.diagnostics.patches());
    const errors = (Zotero.getErrors?.() || []).map(String);
    out.errors.errorConsolePlugin = errors.filter(x => /\[zotero-tts\]|zotero-tts\.js|dead object/i.test(x)).map(x => x.slice(0, 280));
    let debug = ''; try { debug = String(await Zotero.Debug.get()); } catch {}
    out.errors.debugPluginLines = debug.split('\n').filter(x => /\[zotero-tts\]|dead object/i.test(x)).slice(-40).map(x => x.slice(0, 280));
    out.errors.deadObjectCount = out.errors.errorConsolePlugin.filter(x => /dead object/i.test(x)).length + out.errors.debugPluginLines.filter(x => /dead object/i.test(x)).length;
    out.errors.pluginErrorCount = out.errors.errorConsolePlugin.length;
    out.status = out.window?.minimized && out.preferenceMismatches === 0 && out.fixturesRemaining.length === 0 && out.errors.deadObjectCount === 0 ? 'PASS' : 'FAIL';
    if (out.status !== 'PASS') throw new Error('teardown audit mismatch: ' + JSON.stringify({ window: out.window, preferenceMismatches: out.preferenceMismatches, fixturesRemaining: out.fixturesRemaining, errors: out.errors }));
    if (!state.debugStoring) { try { Zotero.Debug.setStore(false); } catch {} }
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error); out.stack = error?.stack ? String(error.stack).split('\n').slice(0, 5).join(' | ') : null;
    throw new Error(JSON.stringify(out));
  }
})()
