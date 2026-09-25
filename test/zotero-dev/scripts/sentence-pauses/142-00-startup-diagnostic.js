// The pauses (issues #44, #142): startup identity. Confirms the installed
// build is this instance (not another session's) before anything else is
// driven. The build-identity grep (computeGap present, nativeSentence and
// ZOTERO_PARAGRAPH_MS absent from the installed bundle; the en-US ftl's
// second pause row) is done outside the bridge, against the profile's
// installed .xpi on disk -- not repeated here.
(async () => {
  if (!Zotero.ZoteroTTS || !Zotero.ZoteroTTS.diagnostics) {
    return JSON.stringify({ ok: false, reason: 'Zotero.ZoteroTTS.diagnostics missing' });
  }
  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  const engine = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
  const step = (name) => {
    for (let i = 0; i < startup.steps.length; i++) if (startup.steps[i].name === name) return startup.steps[i];
    return null;
  };
  return JSON.stringify({
    version: startup.version,
    failed: startup.failed,
    theEngine: step('the Engine'),
    engineFeature: engine.feature,
    pauses: engine.pauses,
  }, null, 1);
})();
