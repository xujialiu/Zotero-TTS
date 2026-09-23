// The Engine (issue #133): startup identity. Confirms the installed build is
// this instance (not another session's) before anything else is driven.
(async () => {
  if (!Zotero.ZoteroTTS || !Zotero.ZoteroTTS.diagnostics) {
    return JSON.stringify({ ok: false, reason: 'Zotero.ZoteroTTS.diagnostics missing' });
  }
  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  const engine = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
  const voiceSwitch = JSON.parse(await Zotero.ZoteroTTS.diagnostics.voiceSwitch());
  const step = (name) => {
    for (let i = 0; i < startup.steps.length; i++) if (startup.steps[i].name === name) return startup.steps[i];
    return null;
  };
  return JSON.stringify({
    version: startup.version,
    failed: startup.failed,
    theEngine: step('the Engine'),
    voiceSwitching: step('voice switching'),
    engineFeature: engine.feature,
    voiceSwitchMechanism: voiceSwitch.mechanism,
  }, null, 1);
})();
