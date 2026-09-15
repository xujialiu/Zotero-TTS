// Baseline for issue #110 (provider-tiers): Zotero/reader state before any
// change, the debug store turned on, and a byte-for-byte snapshot (value,
// hasUserValue, declared type) of every pref this case may touch --
// restored in 09-cleanup-restore.js, readAloud.memory last. Applies the
// run's own state once the snapshot is safely captured: readAloud.volume
// muted to 0, both WebDAV sync switches off. Never writes
// zotero-tts.webdav.syncSettings (recorded only).
// params: none. state: baseline (snapshot object, see readPref shape).
(async () => {
  const out = { step: 'baseline-snapshot' };
  const S = Zotero.ZoteroTTSRun.state;
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
  try {
    out.zoteroVersion = Zotero.version;
    const readers = Zotero.Reader._readers || [];
    out.readersBefore = readers.map((r) => {
      let title = null;
      try {
        const item = Zotero.Items.get(r.itemID);
        const parent = item && item.parentItem ? item.parentItem : item;
        title = parent ? parent.getField('title') : null;
      } catch (e) { title = 'ERR:' + e; }
      const ir = r._internalReader;
      const m = ir && ir._readAloudManager;
      return {
        itemID: r.itemID,
        title,
        popupOpen: !!(ir && ir._state && ir._state.readAloudState && ir._state.readAloudState.popupOpen),
        active: !!(m && m.active),
        paused: m ? !!m.paused : null,
      };
    });
    out.settingsWindowOpenBefore = !!Services.wm.getMostRecentWindow('zotero:pref');
    try {
      const errs = Zotero.getErrors(true) || [];
      out.errorsBefore = { count: errs.length, lastTwo: errs.slice(-2).map(String) };
    } catch (e) { out.errorsBeforeError = String(e); }
    out.debugStoringBefore = Zotero.Debug.storing;
    S.debugStoringBefore = out.debugStoringBefore;
    Zotero.Debug.setStore(true);
    out.debugStoringNow = Zotero.Debug.storing;

    const baseline = {
      volume: readPref('extensions.zotero.zotero-tts.readAloud.volume'),
      webdavSyncPositions: readPref('extensions.zotero.zotero-tts.webdav.syncPositions'),
      webdavAutoUploadSettings: readPref('extensions.zotero.zotero-tts.webdav.autoUploadSettings'),
      webdavSyncSettings: readPref('extensions.zotero.zotero-tts.webdav.syncSettings'),
      sameForAllDocuments: readPref('extensions.zotero.zotero-tts.readAloud.sameForAllDocuments'),
      systemEnabled: readPref('extensions.zotero.zotero-tts.system.enabled'),
      readAloudMemory: readPref('extensions.zotero.zotero-tts.readAloud.memory'),
      readerReadAloudVoices: readPref('extensions.zotero.reader.readAloudVoices'),
    };
    out.baseline = baseline;
    try {
      const parsed = JSON.parse(baseline.readerReadAloudVoices.value || '{}');
      out.readAloudVoicesEnEntry = parsed.en
        ? { voice: parsed.en.voice, tierVoicesKeys: Object.keys(parsed.en.tierVoices || {}) }
        : null;
    } catch (e) { out.readAloudVoicesParseError = String(e); }

    // Apply the run's own state now that the snapshot is safely captured.
    writePref(baseline.volume.key, baseline.volume.type, 0);
    writePref(baseline.webdavSyncPositions.key, baseline.webdavSyncPositions.type, false);
    writePref(baseline.webdavAutoUploadSettings.key, baseline.webdavAutoUploadSettings.type, false);
    out.applied = {
      volume: readPref(baseline.volume.key).value,
      webdavSyncPositions: readPref(baseline.webdavSyncPositions.key).value,
      webdavAutoUploadSettings: readPref(baseline.webdavAutoUploadSettings.key).value,
    };
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  S.baseline = out.baseline || null;
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out);
})();
