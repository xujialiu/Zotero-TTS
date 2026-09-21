// Final cleanup: restores every pref from state.baseline (00-baseline-
// snapshot.js) byte for byte, in order -- the 8 providers' own .enabled
// (only fish was true on this profile; the rest are no-ops), both Zotero
// tiers, sameForAllDocuments, volume, extensions.zotero.reader.
// readAloudVoices (only after every fixture tab is closed -- 09 runs
// first), and zotero-tts.readAloud.memory LAST (a readAloudVoices write
// can make memory-sync rewrite it). Restores Zotero.Debug.storing, closes
// the settings window (09 left it open on the fresh post-reload pane, and
// none was open before this run started), and reports the errors ring.
// Safe to run even if an earlier script threw, as long as 00 completed.
// params: none. state: reads baseline; writes nothing further.
(async () => {
  const out = { step: 'cleanup-restore' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const restored = {};
  try {
    const b = S.baseline;
    if (!b) throw new Error('state.baseline is missing -- 00-baseline-snapshot.js did not complete');

    const restoreOne = (name, entry) => {
      if (!entry.hasUserValue) {
        Services.prefs.clearUserPref(entry.key);
      } else {
        writePref(entry.key, entry.type, entry.value);
      }
      restored[name] = readPref(entry.key);
      restored[name].matches = JSON.stringify(restored[name].value) === JSON.stringify(entry.value) && restored[name].hasUserValue === entry.hasUserValue;
    };

    for (const id of Object.keys(b.providers || {})) restoreOne('provider:' + id, b.providers[id]);
    restoreOne('zoteroStandardEnabled', b.zoteroStandardEnabled);
    restoreOne('zoteroPremiumEnabled', b.zoteroPremiumEnabled);
    restoreOne('sameForAllDocuments', b.sameForAllDocuments);
    restoreOne('volume', b.volume);
    // webdavSyncPositions/AutoUploadSettings were never written by this
    // kit (unlike provider-tiers); report only, for parity with its cleanup.
    restored.webdavUnchanged = {
      syncPositions: (() => { const now = readPref(b.webdavSyncPositions.key); return now.value === b.webdavSyncPositions.value; })(),
      autoUploadSettings: (() => { const now = readPref(b.webdavAutoUploadSettings.key); return now.value === b.webdavAutoUploadSettings.value; })(),
    };

    // Order matters: reader.readAloudVoices before readAloud.memory (last).
    restoreOne('readerReadAloudVoices', b.readerReadAloudVoices);
    restoreOne('readAloudMemory', b.readAloudMemory);

    out.restored = restored;
    out.allMatch = Object.keys(restored).every((k) => k === 'webdavUnchanged' || restored[k].matches !== false);
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
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win) {
      win.close();
      const t0 = Date.now();
      while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t0 < 10000) await sleep(200);
    }
    out.settingsWindowOpenAfter = !!Services.wm.getMostRecentWindow('zotero:pref');
  } catch (e) {
    out.settingsWindowCheckError = String(e);
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
  return JSON.stringify(out);
})();
