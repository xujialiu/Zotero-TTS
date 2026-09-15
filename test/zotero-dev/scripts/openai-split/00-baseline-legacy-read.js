// Baseline for issue #113 (openai-split), run BEFORE the install: Zotero/
// reader state, the debug store turned on, proof the installed build is
// still pre-split (diagnostics.openaiSplit is undefined), and a byte-exact
// read of every pref the migration will consume or this run will touch --
// restored in 05-restore-item5.js, readAloud.memory and
// reader.readAloudVoices before webdav.autoUploadSettings LAST. Never
// returns openai.apiKey, openai.headers or openai.baseURL as text: length
// only. Applies the run's own state once the snapshot is safely captured:
// readAloud.volume muted to 0, webdav.autoUploadSettings off (it was on).
// params: none. state: baseline (snapshot object).
(async () => {
  const out = { step: 'baseline-legacy-read' };
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

    // Proves the currently-installed plugin predates the split (issue
    // #113): the new diagnostic does not exist yet.
    out.openaiSplitDiagnosticBefore = typeof Zotero.ZoteroTTS?.diagnostics?.openaiSplit;
    out.providerTiersLabelsBefore = null;
    try {
      const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
      out.providerTiersLabelsBefore = pt.labels;
    } catch (e) { out.providerTiersLabelsBeforeError = String(e); }
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
      legacy: {
        enabled: readPref(PREFIX + 'openai.enabled'),
        server: readPref(PREFIX + 'openai.server'),
        model: readPref(PREFIX + 'openai.model'),
        voices: readPref(PREFIX + 'openai.voices'),
      },
    };
    out.baseline = baseline;

    // apiKey / headers / baseURL: length only, never the text.
    const apiKeyPref = readPref(PREFIX + 'openai.apiKey');
    const headersPref = readPref(PREFIX + 'openai.headers');
    const baseURLPref = readPref(PREFIX + 'openai.baseURL');
    out.legacyLengths = {
      apiKeyLength: String(apiKeyPref.value || '').length,
      apiKeyHasUserValue: apiKeyPref.hasUserValue,
      headersLength: String(headersPref.value || '').length,
      headersHasUserValue: headersPref.hasUserValue,
      baseURLLength: String(baseURLPref.value || '').length,
      baseURLHasUserValue: baseURLPref.hasUserValue,
    };

    // presetValues: which of the four presets it remembers, never a field's value.
    const presetPref = readPref(PREFIX + 'openai.presetValues');
    out.presetKeys = { hasUserValue: presetPref.hasUserValue, length: String(presetPref.value || '').length, holds: [] };
    try {
      const parsed = JSON.parse(presetPref.value || '{}');
      out.presetKeys.holds = ['openai', 'chatterbox', 'mimo', 'other'].filter((k) => parsed && typeof parsed === 'object' && parsed[k] && typeof parsed[k] === 'object');
    } catch (e) { out.presetKeysParseError = String(e); }

    // tierVoices keys, and any openai:: id, across reader.readAloudVoices.
    out.tierVoicesKeys = [];
    out.openaiVoiceIdsIn = { readerReadAloudVoices: [], readAloudMemory: false, favoriteVoices: 0 };
    try {
      const rav = JSON.parse(baseline.readerReadAloudVoices.value || '{}');
      const tierKeySet = new Set();
      for (const lang of Object.keys(rav)) {
        const entry = rav[lang];
        if (!entry || typeof entry !== 'object') continue;
        if (typeof entry.voice === 'string' && entry.voice.startsWith('openai::')) out.openaiVoiceIdsIn.readerReadAloudVoices.push(lang + ':voice');
        const tv = entry.tierVoices;
        if (tv && typeof tv === 'object') {
          for (const [tier, id] of Object.entries(tv)) {
            tierKeySet.add(tier);
            if (tier === 'openai' || (typeof id === 'string' && id.startsWith('openai::'))) out.openaiVoiceIdsIn.readerReadAloudVoices.push(lang + ':tierVoices.' + tier);
          }
        }
      }
      out.tierVoicesKeys = [...tierKeySet].sort();
    } catch (e) { out.tierVoicesParseError = String(e); }
    try {
      const mem = JSON.parse(baseline.readAloudMemory.value || '{}');
      out.openaiVoiceIdsIn.readAloudMemory = !!(mem && mem.voice && typeof mem.voice.id === 'string' && mem.voice.id.startsWith('openai::'));
    } catch (e) { out.memoryParseError = String(e); }
    try {
      const favText = String(baseline.favoriteVoices.value || '');
      const favs = favText ? favText.split(',').map((s) => s.trim()).filter(Boolean) : [];
      out.openaiVoiceIdsIn.favoriteVoices = favs.filter((id) => id.startsWith('openai::')).length;
    } catch (e) { out.favoritesParseError = String(e); }

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
  S.snapshot = out;
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
