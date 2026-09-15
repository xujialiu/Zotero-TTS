// Item 1 (issue #113): after the in-place upgrade (done by the tester's own
// zotero_plugin_install call, then diagnostics.startup() checked directly),
// this script reads diagnostics.openaiSplit() and cross-checks it against
// 00's pre-install baseline. Masks sections[*].baseURL down to a length
// itself -- the diagnostic returns it verbatim, this script never lets it
// leave the sandbox read in full. legacyPrefs must read every openai.*
// field as undefined afterwards (Zotero.Prefs.get(name, true)).
// params: none. state: reads baseline; writes nothing.
(async () => {
  const out = { step: 'post-install-item1' };
  const S = Zotero.ZoteroTTSRun.state;
  try {
    const raw = JSON.parse(await Zotero.ZoteroTTS.diagnostics.openaiSplit());
    out.feature = raw.feature;
    out.report = raw.report;
    // Mask baseURL to a length in every section before this ever returns.
    out.sections = {};
    for (const [id, fields] of Object.entries(raw.sections || {})) {
      out.sections[id] = { ...fields };
      if ('baseURL' in out.sections[id]) {
        out.sections[id].baseURLLength = String(out.sections[id].baseURL || '').length;
        out.sections[id].baseURLPresent = !!out.sections[id].baseURL;
        delete out.sections[id].baseURL;
      }
    }
    out.legacyPrefs = raw.legacyPrefs;

    // Every openai.* field reads undefined now, through the relative name + true.
    const LEGACY_FIELDS = ['enabled', 'apiKey', 'baseURL', 'model', 'voice', 'voices', 'headers', 'server', 'presetValues'];
    out.legacyNowUndefined = {};
    for (const f of LEGACY_FIELDS) out.legacyNowUndefined[f] = Zotero.Prefs.get('extensions.zotero.zotero-tts.openai.' + f, true) === undefined;

    // Cross-check against the pre-install baseline (00's read, full object in state.snapshot).
    const snap = S.snapshot;
    const b = S.baseline;
    out.crossCheck = b ? {
      oldServerValue: b.legacy && b.legacy.server ? b.legacy.server.value : null,
      oldEnabledWas: b.legacy && b.legacy.enabled ? b.legacy.enabled.value : null,
      tierVoicesKeysBefore: snap ? snap.tierVoicesKeys : null,
      openaiVoiceIdsInBefore: snap ? snap.openaiVoiceIdsIn : null,
      presetKeysBefore: snap ? snap.presetKeys.holds : null,
    } : null;

    // The reader.readAloudVoices tierVoices key that used to be "openai"
    // should now be the target; read the CURRENT pref and report its keys.
    const ravNow = Zotero.Prefs.get('reader.readAloudVoices', true);
    const tierKeysAfter = new Set();
    try {
      const parsed = JSON.parse(ravNow || '{}');
      for (const lang of Object.keys(parsed)) {
        const tv = parsed[lang] && parsed[lang].tierVoices;
        if (tv && typeof tv === 'object') for (const k of Object.keys(tv)) tierKeysAfter.add(k);
      }
    } catch (e) { out.tierKeysAfterError = String(e); }
    out.tierVoicesKeysAfter = [...tierKeysAfter].sort();
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
