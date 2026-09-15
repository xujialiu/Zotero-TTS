// Item 5: a selection no voice carries. From chrome, waives the manager's
// Xrays (the same reference the plugin's own code operates on), forces
// `_selectedTier = 'azure'` -- a key no listed voice has -- and calls the
// shadowed `_resolveVoice()` directly, then reads providerTiers() for the
// fixture reader to see where the stranded pick moved and by which step of
// the rule.
// params: none (reads state.fixture). state: none written.
(async () => {
  const out = { step: 'stranded-selection' };
  const S = Zotero.ZoteroTTSRun.state;
  try {
    const fixture = S.fixture;
    if (!fixture) throw new Error('state.fixture is missing -- run 02-open-fixture-item1.js first');
    const rs = Zotero.Reader._readers || [];
    const r = rs.find((x) => x.itemID === fixture.itemID);
    if (!r) throw new Error('fixture reader not found for item ' + fixture.itemID);
    const m = Components.utils.waiveXrays(r._internalReader._readAloudManager);
    out.before = {
      selectedTier: m.selectedTier,
      selectedVoiceID: m.selectedVoiceID ? String(m.selectedVoiceID) : null,
      voicesLength: m.voices.length,
    };

    let logBefore = '';
    try { logBefore = String(await Zotero.Debug.get()); } catch (e) { /* best-effort */ }

    m._selectedTier = 'azure';
    await m._resolveVoice();

    out.after = {
      selectedTier: m.selectedTier,
      selectedVoiceID: m.selectedVoiceID ? String(m.selectedVoiceID) : null,
      voicesLength: m.voices.length,
      paused: m.paused,
    };

    const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    const mine = pt.readers.find((x) => x.title === fixture.title);
    out.diagnostics = mine || null;

    try {
      const logAfter = String(await Zotero.Debug.get());
      const added = logAfter.slice(logBefore.length);
      out.newDebugLines = added.split('\n').filter((l) => l.includes('has no voices any more'));
    } catch (e) {
      out.debugError = String(e);
    }
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out);
})();
