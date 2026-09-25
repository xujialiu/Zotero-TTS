// Final cleanup: closes the fixture reader (whichever tab is currently
// open for state.fixture.id -- item 4 reopened a new one), erases the
// fixture item (rows back toward the baseline count), and restores every
// pref in state.baseline byte for byte -- zotero-standard.enabled,
// readAloud.volume, then readAloud.memory LAST (unchanged all run, but
// still rewritten verbatim, since a chrome-scope write elsewhere could in
// principle have moved it). Restores Zotero.Debug.storing. Reports the
// position rows, the settings window and the errors ring at the end.
// Never touches webdav.* -- handled entirely outside this kit.
// params: none. state: reads baseline, fixture.
(async () => {
  const out = { step: 'cleanup' };
  const S = Zotero.ZoteroTTSRun.state;
  function writePref(fullName, type, value) {
    if (type === Services.prefs.PREF_STRING) Services.prefs.setStringPref(fullName, String(value));
    else if (type === Services.prefs.PREF_INT) Services.prefs.setIntPref(fullName, value);
    else if (type === Services.prefs.PREF_BOOL) Services.prefs.setBoolPref(fullName, !!value);
    else throw new Error('cannot write pref of type ' + type + ' at ' + fullName);
  }
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
  const restoreOne = (name, entry) => {
    if (!entry) { return { skipped: true }; }
    if (!entry.hasUserValue) Services.prefs.clearUserPref(entry.key);
    else writePref(entry.key, entry.type, entry.value);
    const now = readPref(entry.key);
    return { ...now, matches: JSON.stringify(now.value) === JSON.stringify(entry.value) && now.hasUserValue === entry.hasUserValue };
  };
  try {
    const list = Zotero.Reader._readers || [];
    let reader = null;
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === S.fixture.id) reader = list[i];
    if (reader) {
      const pending = reader.close();
      if (pending && typeof pending.then === 'function') await pending;
      out.readerClosed = true;
    } else out.readerClosed = 'already closed';

    const item = Zotero.Items.get(S.fixture.id);
    if (item) { await item.eraseTx(); out.fixtureErased = true; } else out.fixtureErased = 'already gone';

    out.restored = {
      zoteroStandardEnabled: restoreOne('zoteroStandardEnabled', S.baseline.zoteroStandardEnabled),
      volume: restoreOne('volume', S.baseline.volume),
      memory: restoreOne('memory', S.baseline.memory),
    };

    if (typeof S.debugStoringBefore === 'boolean') Zotero.Debug.setStore(S.debugStoringBefore);
    out.debugStoringRestoredTo = Zotero.Debug.storing;

    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    out.positionRowsAfter = pos.database.rows;

    out.settingsWindowOpenAfter = !!Services.wm.getMostRecentWindow('zotero:pref');
    const errs = Zotero.getErrors(true) || [];
    out.errorsAfter = { count: errs.length, lastFive: errs.slice(-5).map(String) };

    const finalStartup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
    out.finalStartup = { version: finalStartup.version, failed: finalStartup.failed };

    out.readersFinal = (Zotero.Reader._readers || []).map(r => ({ itemID: r.itemID }));
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
