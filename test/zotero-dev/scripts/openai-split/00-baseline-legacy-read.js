// Baseline for issue #113 (openai-split) RE-RUN (2026-09-16, verifying fix
// 7f7d953): this profile is ALREADY migrated -- the first run's install plus
// the main session's manual recovery after the bug -- so this run's job is
// to prove the fix's gate does NOT re-run the migration on a second in-place
// install, not to watch a fresh migration happen. Captures, before ANY
// install this run: Zotero/reader state, the debug store turned on, the
// CURRENTLY INSTALLED (still-buggy, commit 3c40365) build's own
// diagnostics.openaiSplit() reading (report/legacyPrefs/sections, baseURL
// masked to a length before it ever leaves the sandbox read) as the "known
// good" snapshot the two new installs are diffed against, whether
// `staleDefaults` exists on that output at all (it should NOT: only the
// fixed build adds it, and the version string alone cannot tell the two
// 1.12.12-beta builds apart), and hasUserValue + length/value for the nine
// legacy `openai.*` fields (independent of the diagnostic, for a
// cross-check once the new build is in). Never returns openai.apiKey/
// headers/baseURL, or any new section's apiKey/headers/baseURL, as text:
// length only. Applies the run's own state once the snapshot is safely
// captured: readAloud.volume -> 0, webdav.autoUploadSettings -> false (it
// was on).
// params: none. state: baseline, preInstall (small; every LATER script in
// this kit re-reads its own diagnostics call fresh rather than depending on
// this surviving a separate start() call -- the first run found
// state.snapshot, a larger object, did not survive that way).
(async () => {
  const out = { step: 'baseline-legacy-read-rerun' };
  const S = Zotero.ZoteroTTSRun.state;
  const PREFIX = 'extensions.zotero.zotero-tts.';
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
      return { itemID: r.itemID, title, active: !!(m && m.active), paused: m ? !!m.paused : null };
    });
    out.settingsWindowOpenBefore = !!Services.wm.getMostRecentWindow('zotero:pref');

    try {
      const errs = Zotero.getErrors(true) || [];
      out.errorsBefore = { count: errs.length, lastTwo: errs.slice(-2).map(String) };
    } catch (e) { out.errorsBeforeError = String(e); }
    out.debugStoringBefore = Zotero.Debug.storing;
    S.debugStoringBefore = out.debugStoringBefore;
    Zotero.Debug.setStore(true);

    // The CURRENTLY installed build predates the fix but already has
    // diagnostics.openaiSplit() (commit 3c40365 added it) -- 'function'
    // here, not 'undefined' as a truly pre-split build would show. What
    // distinguishes the two same-version 1.12.12-beta builds is
    // `staleDefaults`, which only 7f7d953 adds.
    out.openaiSplitDiagnosticTypeBefore = typeof Zotero.ZoteroTTS?.diagnostics?.openaiSplit;
    out.preInstall = null;
    try {
      const raw = JSON.parse(await Zotero.ZoteroTTS.diagnostics.openaiSplit());
      const sections = {};
      for (const [id, fields] of Object.entries(raw.sections || {})) {
        sections[id] = { ...fields };
        if ('baseURL' in sections[id]) {
          // The pre-fix build's diagnostic returns baseURL raw (a string);
          // the fixed build (7f7d953) masks it to a length (a number) at
          // the source, same as apiKey/headers always were -- handle both
          // shapes so this script stays correct once this build is gone.
          const b = sections[id].baseURL;
          sections[id].baseURLLength = typeof b === 'number' ? b : String(b || '').length;
          delete sections[id].baseURL;
        }
      }
      out.preInstall = {
        feature: raw.feature,
        report: raw.report,
        legacyPrefs: raw.legacyPrefs,
        hasStaleDefaultsKey: 'staleDefaults' in raw,
        staleDefaults: raw.staleDefaults ?? null,
        sections,
      };
    } catch (e) { out.preInstallError = String(e); }

    try {
      out.positionBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    } catch (e) { out.positionBeforeError = String(e); }

    const baseline = {
      volume: readPref(PREFIX + 'readAloud.volume'),
      webdavAutoUploadSettings: readPref(PREFIX + 'webdav.autoUploadSettings'),
      webdavSyncSettings: readPref(PREFIX + 'webdav.syncSettings'),
      readAloudMemory: readPref(PREFIX + 'readAloud.memory'),
      readerReadAloudVoices: readPref('extensions.zotero.reader.readAloudVoices'),
      favoriteVoices: readPref(PREFIX + 'readAloud.favoriteVoices'),
      mimoEnabled: readPref(PREFIX + 'mimo.enabled'),
      compatibleEnabled: readPref(PREFIX + 'compatible.enabled'),
      openaiOfficialEnabled: readPref(PREFIX + 'openai-official.enabled'),
    };
    out.baseline = baseline;

    // Legacy openai.* fields: hasUserValue for all nine (must be false on an
    // already-migrated profile) and length only for the three that may hold
    // a secret or an address.
    const SECRET_OR_ADDRESS = new Set(['apiKey', 'headers', 'baseURL']);
    out.legacyFields = {};
    for (const f of ['enabled', 'apiKey', 'baseURL', 'model', 'voice', 'voices', 'headers', 'server', 'presetValues']) {
      const p = readPref(PREFIX + 'openai.' + f);
      out.legacyFields[f] = SECRET_OR_ADDRESS.has(f)
        ? { hasUserValue: p.hasUserValue, length: String(p.value || '').length }
        : { hasUserValue: p.hasUserValue, value: p.value };
    }

    // The new sections' own secret/address fields, length/value only, for
    // the record -- this is what "sections unchanged" is checked against.
    out.currentSectionLengths = {
      mimoApiKeyLength: String(readPref(PREFIX + 'mimo.apiKey').value || '').length,
      mimoModel: readPref(PREFIX + 'mimo.model').value,
      compatibleBaseURLLength: String(readPref(PREFIX + 'compatible.baseURL').value || '').length,
      compatibleHeadersLength: String(readPref(PREFIX + 'compatible.headers').value || '').length,
      compatibleModel: readPref(PREFIX + 'compatible.model').value,
      openaiOfficialApiKeyLength: String(readPref(PREFIX + 'openai-official.apiKey').value || '').length,
    };

    // Apply the run's own state now that the snapshot is safely captured.
    writePref(baseline.volume.key, baseline.volume.type, 0);
    writePref(baseline.webdavAutoUploadSettings.key, baseline.webdavAutoUploadSettings.type, false);
    out.applied = {
      volume: readPref(baseline.volume.key).value,
      webdavAutoUploadSettings: readPref(baseline.webdavAutoUploadSettings.key).value,
    };
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  S.baseline = out.baseline || null;
  S.preInstall = out.preInstall || null;
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
