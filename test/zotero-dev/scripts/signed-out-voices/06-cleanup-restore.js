// Final cleanup (issue #130): closes the fixture tab and erases the
// imported attachment (eraseTx(), rows back to baseline -- checked via
// diagnostics.position().database.rows before/after, baseline.md's own
// convention), restores every pref from state.baseline byte for byte, in
// order -- usePluginPlayer, both Zotero tiers and every provider's
// .enabled (all no-ops: this case never writes them, recorded only),
// volume, and readAloud.memory LAST. Restores Zotero.Debug.storing and
// reports the errors ring. Safe to run even if an earlier script threw,
// as long as 00 completed (fixtureItemID/baseline are in state).
// params: none. state: reads fixtureItemID/fixtureTabID/baseline; writes
// nothing further.
(async () => {
  const out = { step: 'cleanup-restore' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function readPref(fullName) {
    const type = Services.prefs.getPrefType(fullName);
    const hasUserValue = Services.prefs.prefHasUserValue(fullName);
    let value = null;
    try {
      if (type === Services.prefs.PREF_STRING) value = Services.prefs.getStringPref(fullName, '');
      else if (type === Services.prefs.PREF_INT) value = Services.prefs.getIntPref(fullName, 0);
      else if (type === Services.prefs.PREF_BOOL) value = Services.prefs.getBoolPref(fullName, false);
    } catch (e) { value = 'ERR:' + e; }
    return { key: fullName, type, hasUserValue, value };
  }
  function writePref(fullName, type, value) {
    if (type === Services.prefs.PREF_STRING) Services.prefs.setStringPref(fullName, String(value));
    else if (type === Services.prefs.PREF_INT) Services.prefs.setIntPref(fullName, value);
    else if (type === Services.prefs.PREF_BOOL) Services.prefs.setBoolPref(fullName, !!value);
    else throw new Error('cannot write pref of type ' + type + ' at ' + fullName);
  }
  const restored = {};
  const restoreOne = (name, entry) => {
    if (!entry) { restored[name] = { skipped: true }; return; }
    if (!entry.hasUserValue) Services.prefs.clearUserPref(entry.key);
    else writePref(entry.key, entry.type, entry.value);
    restored[name] = readPref(entry.key);
    restored[name].matches = JSON.stringify(restored[name].value) === JSON.stringify(entry.value) && restored[name].hasUserValue === entry.hasUserValue;
  };

  try {
    const posBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    out.databaseRowsBeforeErase = posBefore.database ? posBefore.database.rows : null;

    const itemID = S.fixtureItemID;
    const tabID = S.fixtureTabID;
    if (itemID) {
      const mainWin = Zotero.getMainWindow();
      if (mainWin && mainWin.Zotero_Tabs && tabID) mainWin.Zotero_Tabs.close(tabID);
      const t0 = Date.now();
      while (Date.now() - t0 < 10000) {
        const rs = Zotero.Reader._readers || [];
        if (!rs.some((x) => x.itemID === itemID)) break;
        await sleep(150);
      }
      out.tabClosed = !(Zotero.Reader._readers || []).some((x) => x.itemID === itemID);
      try {
        const item = await Zotero.Items.getAsync(itemID);
        if (item) { await item.eraseTx(); out.erased = true; }
      } catch (e) { out.eraseError = String(e); }
    } else {
      out.noFixtureToErase = true;
    }

    const posAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    out.databaseRowsAfterErase = posAfter.database ? posAfter.database.rows : null;
    out.rowsBackToBaseline = out.databaseRowsBeforeErase !== null && out.databaseRowsAfterErase !== null
      ? out.databaseRowsAfterErase <= out.databaseRowsBeforeErase
      : null;

    const b = S.baseline;
    if (!b) throw new Error('state.baseline is missing -- 00-baseline-setup.js did not complete');
    restoreOne('usePluginPlayer', b.usePluginPlayer);
    restoreOne('zoteroStandardEnabled', b.zoteroStandardEnabled);
    restoreOne('zoteroPremiumEnabled', b.zoteroPremiumEnabled);
    for (const id of Object.keys(b.providers || {})) restoreOne('provider:' + id, b.providers[id]);
    restoreOne('volume', b.volume);
    // readAloud.memory LAST (a pref write elsewhere can make memory-sync rewrite it).
    restoreOne('readAloudMemory', b.readAloudMemory);

    out.restored = restored;
    out.allMatch = Object.keys(restored).every((k) => restored[k].matches !== false);
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  try {
    if (typeof S.debugStoringBefore === 'boolean') Zotero.Debug.setStore(S.debugStoringBefore);
    out.debugStoringRestoredTo = Zotero.Debug.storing;
  } catch (e) {
    out.debugRestoreError = String(e);
  }
  try {
    const errs = Zotero.getErrors(true) || [];
    out.errorsAfter = { count: errs.length, lastFive: errs.slice(-5).map(String) };
  } catch (e) {
    out.errorsAfterError = String(e);
  }
  try {
    out.readersOpenAtEnd = (Zotero.Reader._readers || []).map((r) => ({ itemID: r.itemID, tabID: r.tabID }));
  } catch (e) {
    out.readersOpenAtEndError = String(e);
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
