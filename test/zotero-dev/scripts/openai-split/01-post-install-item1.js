// Item 1 (issue #113) post-install check, RE-RUN 2026-09-16 against the fix
// (7f7d953). Run this SAME script once after EACH zotero_plugin_install
// (both done by the tester directly through the bridge, plus a direct
// diagnostics.startup() check each time -- neither is a script). Fixed from
// the first run: line read `Zotero.Prefs.get('reader.readAloudVoices',
// true)` -- a RELATIVE name with the global flag, which reads undefined and
// proves nothing (the full name is 'extensions.zotero.reader.readAloudVoices').
// Self-contained: does not depend on Zotero.ZoteroTTSRun.state surviving
// from 00's separate start() call (the first run found state.snapshot, a
// large object, did not survive that way, while state.baseline, small, did)
// -- every check here is either a fresh diagnostics.openaiSplit() read or a
// direct Services.prefs / Zotero.Prefs read of the same fields the
// diagnostic itself computes from, so the main session compares this
// script's two outputs (after install 1, after install 2) against each
// other and against 00's preInstall reading directly, from the returned
// JSON alone -- both fit well under the runner's 2,000-character cap.
// params: none. state: writes nothing.
(async () => {
  const out = { step: 'post-install-item1' };
  const PREFIX = 'extensions.zotero.zotero-tts.';
  try {
    const raw = JSON.parse(await Zotero.ZoteroTTS.diagnostics.openaiSplit());
    out.feature = raw.feature;
    out.report = raw.report;
    out.legacyPrefs = raw.legacyPrefs;
    out.hasStaleDefaultsKey = 'staleDefaults' in raw;
    out.staleDefaults = raw.staleDefaults ?? null;

    // Mask baseURL to a length in every section before this ever returns.
    out.sections = {};
    for (const [id, fields] of Object.entries(raw.sections || {})) {
      out.sections[id] = { ...fields };
      if ('baseURL' in out.sections[id]) {
        // The fixed build (7f7d953) masks baseURL to a length (a number) at
        // the source, same as apiKey/headers always were -- handle a raw
        // string too, in case this ever runs against an older build.
        const b = out.sections[id].baseURL;
        out.sections[id].baseURLLength = typeof b === 'number' ? b : String(b || '').length;
        delete out.sections[id].baseURL;
      }
    }

    // Independent cross-check of legacyPrefs/staleDefaults: prefHasUserValue
    // per field (false for all nine is the whole point of the fix), and
    // whether the default branch still answers a defined value (true for
    // all nine as long as this process has loaded a pre-split build).
    const LEGACY_FIELDS = ['enabled', 'apiKey', 'baseURL', 'model', 'voice', 'voices', 'headers', 'server', 'presetValues'];
    out.legacyIndependentCheck = {};
    for (const f of LEGACY_FIELDS) {
      const full = PREFIX + 'openai.' + f;
      const hasUserValue = Services.prefs.prefHasUserValue(full);
      const defaultDefined = Zotero.Prefs.get(full, true) !== undefined;
      out.legacyIndependentCheck[f] = { hasUserValue, defaultDefined };
    }
    out.legacyIndependentAllNoUserValue = LEGACY_FIELDS.every((f) => out.legacyIndependentCheck[f].hasUserValue === false);
    out.legacyIndependentAllStaleDefault = LEGACY_FIELDS.every((f) => out.legacyIndependentCheck[f].defaultDefined === true);

    // reader.readAloudVoices / readAloud.memory: read-only, FULL pref names
    // with the global flag (the fixed mistake above) -- confirms no
    // openai:: id anywhere, and (informationally) the tierVoices keys.
    const ravNow = Zotero.Prefs.get('extensions.zotero.reader.readAloudVoices', true);
    const tierKeysAfter = new Set();
    const openaiIdsAfter = [];
    try {
      const parsed = JSON.parse(ravNow || '{}');
      for (const lang of Object.keys(parsed)) {
        const entry = parsed[lang];
        if (entry && typeof entry.voice === 'string' && entry.voice.startsWith('openai::')) openaiIdsAfter.push(lang + ':voice');
        const tv = entry && entry.tierVoices;
        if (tv && typeof tv === 'object') {
          for (const [tier, id] of Object.entries(tv)) {
            tierKeysAfter.add(tier);
            if (tier === 'openai' || (typeof id === 'string' && id.startsWith('openai::'))) openaiIdsAfter.push(lang + ':tierVoices.' + tier);
          }
        }
      }
    } catch (e) { out.tierKeysAfterError = String(e); }
    out.tierVoicesKeysAfter = [...tierKeysAfter].sort();
    out.openaiVoiceIdsAfter = openaiIdsAfter;

    const memNow = Zotero.Prefs.get(PREFIX + 'readAloud.memory', true);
    try {
      const mem = JSON.parse(memNow || '{}');
      out.memoryVoiceIdAfter = mem && mem.voice ? mem.voice.id : null;
      out.memoryIsOpenaiAfter = !!(mem && mem.voice && typeof mem.voice.id === 'string' && mem.voice.id.startsWith('openai::'));
    } catch (e) { out.memoryParseError = String(e); }
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
