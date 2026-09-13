return (async () => {
  const root = Zotero.__ztts95Followup;
  const fixture = root?.fixtures.a;
  if (!root || !fixture?.reader) throw new Error('fixture A is missing');
  const internal = fixture.reader._internalReader;
  const manager = internal?._readAloudManager;
  if (!manager) throw new Error('fixture A manager is missing');
  const sameName = 'extensions.zotero.zotero-tts.readAloud.sameForAllDocuments';
  const originalSame = { value: Services.prefs.getBoolPref(sameName), user: Services.prefs.prefHasUserValue(sameName) };
  const targetID = root.voices[1];
  const reset = async () => {
    Services.prefs.setBoolPref(sameName, false);
    fixture.delayMs = 0; fixture.delayVoiceID = null; fixture.failVoiceID = null; fixture.failNext = false; fixture.noTimestamps = false;
    if (!manager.active || !manager._segments?.length || manager.selectedVoiceID !== root.voices[0]) {
      try { if (internal._state?.readAloudState?.popupOpen === false) internal.toggleReadAloudPopup(true); } catch (e) {}
    }
    await root.activate(fixture, root.voices[0], true);
    await root.sleep(100);
  };
  const state = () => root.read(fixture);
  const diag = () => root.diag(fixture).handoff;
  const begin = async action => {
    await reset();
    fixture.calls.length = 0;
    fixture.delayMs = 600; fixture.delayVoiceID = targetID;
    const old = manager._controller;
    const triggered = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(1, (Zotero.Reader._readers || []).indexOf(fixture.reader)));
    await root.sleep(180);
    const pending = { state: state(), handoff: diag(), targetCalls: fixture.calls.filter(c => c.voiceID === targetID).length };
    let actionResult = null, actionError = null;
    try { actionResult = await action(); } catch (e) { actionError = String(e); }
    const immediate = { state: state(), handoff: diag(), targetCalls: fixture.calls.filter(c => c.voiceID === targetID).length };
    await root.sleep(700);
    const final = { state: state(), handoff: diag(), targetCalls: fixture.calls.filter(c => c.voiceID === targetID).length };
    return { triggered: { readers: triggered.readers?.length ?? null }, pending, actionResult, actionError, immediate, final, oldAlive: !!old && !old._destroyed };
  };
  const out = {};
  try {
    out.speed = await begin(async () => { manager.setSpeed(manager.speed, false); return { speed: manager.speed }; });
    out.skip = await begin(async () => { manager.skipAhead('sentence', false); return { position: manager._controller?._position ?? null }; });
    out.manualVoice = await begin(async () => { manager.selectVoice(root.voices[2]); return { selected: manager.selectedVoiceID }; });
    out.deactivate = await begin(async () => {
      manager.deactivate();
      // Closing the fixture popup keeps Zotero's own auto-activation path from
      // reopening the session before the cancellation observation is read.
      try { if (internal._state?.readAloudState?.popupOpen) internal.toggleReadAloudPopup(false); } catch (e) {}
      return { active: !!manager.active, paused: !!manager.paused, popupOpen: !!internal._state?.readAloudState?.popupOpen };
    });
  } finally {
    fixture.delayMs = 0; fixture.delayVoiceID = null; fixture.failVoiceID = null; fixture.failNext = false; fixture.noTimestamps = false;
    if (originalSame.user) Services.prefs.setBoolPref(sameName, originalSame.value);
    else if (Services.prefs.prefHasUserValue(sameName)) Services.prefs.clearUserPref(sameName);
  }
  for (const key of ['speed', 'skip', 'manualVoice', 'deactivate']) {
    const x = out[key];
    const cancelled = x.pending.handoff?.pending === targetID && x.immediate.handoff?.pending === null && x.immediate.handoff?.stage === 'cancelled' && x.final.handoff?.pending === null;
    const targetNotPlayed = x.final.targetCalls === x.pending.targetCalls;
    const manualExpected = key === 'manualVoice' ? x.immediate.state.selected === root.voices[2] : true;
    const deactivateExpected = key === 'deactivate' ? x.immediate.state.active === false : true;
    x.status = cancelled && targetNotPlayed && manualExpected && deactivateExpected ? 'PASS' : 'FAIL';
  }
  out.restored = { sameForAllDocuments: { value: Services.prefs.getBoolPref(sameName), user: Services.prefs.prefHasUserValue(sameName) } };
  return JSON.stringify(out, null, 1);
})()
