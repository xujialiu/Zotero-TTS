// Final cleanup: restores every pref from state.baseline (00-baseline-snapshot.js)
// byte for byte, in order -- system.enabled, both WebDAV switches (via
// setBoolPref(true), matching their original user value), sameForAllDocuments
// (already restored at the tail of 06-provider-switch-between-opens.js; reasserted
// here defensively), volume, extensions.zotero.reader.readAloudVoices (only
// after the fixture tab is closed -- 08-after-reload-dispose.js runs first),
// and zotero-tts.readAloud.memory LAST, since a change to reader.readAloudVoices
// can make memory-sync rewrite it. Restores Zotero.Debug.storing and reports
// the settings window and errors ring at the end. Safe to run even if an
// earlier script threw, as long as 00 completed (state.baseline exists).
// params: none. state: reads baseline; writes nothing further.
(async () => {
  const out = { step: 'cleanup-restore' };
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

    restoreOne('systemEnabled', b.systemEnabled);
    restoreOne('webdavSyncPositions', b.webdavSyncPositions);
    restoreOne('webdavAutoUploadSettings', b.webdavAutoUploadSettings);
    restoreOne('sameForAllDocuments', b.sameForAllDocuments);
    restoreOne('volume', b.volume);
    // webdav.syncSettings was never written; report only.
    restored.webdavSyncSettingsUnchanged = (() => {
      const now = readPref(b.webdavSyncSettings.key);
      return now.value === b.webdavSyncSettings.value && now.hasUserValue === b.webdavSyncSettings.hasUserValue;
    })();

    // Order matters: reader.readAloudVoices before readAloud.memory (last),
    // and both only after the fixture tab is closed.
    restoreOne('readerReadAloudVoices', b.readerReadAloudVoices);
    restoreOne('readAloudMemory', b.readAloudMemory);

    out.restored = restored;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  try {
    // Debug store: restored to whatever it was before 00-baseline-snapshot.js turned it on.
    if (typeof S.debugStoringBefore === 'boolean') Zotero.Debug.setStore(S.debugStoringBefore);
    out.debugStoringRestoredTo = Zotero.Debug.storing;
  } catch (e) {
    out.debugRestoreError = String(e);
  }
  try {
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
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out);
})();
