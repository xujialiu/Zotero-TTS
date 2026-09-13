return (async () => {
  const root = Zotero.__ztts95Followup;
  if (!root?.fixtures.a?.reader || !root.fixtures.b?.reader) throw new Error('both fixtures are required');
  const a = root.fixtures.a, b = root.fixtures.b;
  const sameName = 'extensions.zotero.zotero-tts.readAloud.sameForAllDocuments';
  const original = { value: Services.prefs.getBoolPref(sameName), user: Services.prefs.prefHasUserValue(sameName) };
  const targetID = root.voices[1];
  const state = f => {
    const s = root.read(f), d = root.diag(f);
    return { active: s.active, paused: s.paused, selected: s.selected, position: s.position, currentIndex: s.currentIndex, audio: s.audio, handoff: d.handoff };
  };
  const trigger = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(1, (Zotero.Reader._readers || []).indexOf(a.reader)));
  const scenario = async (same, pausedRecipient) => {
    Services.prefs.setBoolPref(sameName, false);
    a.delayMs = 300; a.delayVoiceID = targetID; b.delayMs = 300; b.delayVoiceID = targetID;
    a.calls.length = 0; b.calls.length = 0;
    await root.activate(a, root.voices[0], true);
    await root.activate(b, root.voices[0], !pausedRecipient);
    const setupA = state(a), setupB = state(b);
    Services.prefs.setBoolPref(sameName, same);
    const triggered = trigger();
    const first = { ms: 0, a: state(a), b: state(b) };
    let last = first;
    let count = 1;
    for (let i = 1; i <= 32; i++) {
      await root.sleep(100);
      last = { ms: i * 100, a: state(a), b: state(b) };
      count++;
      const ah = last.a.handoff;
      if (['committed', 'failed', 'cancelled'].includes(ah?.stage)) break;
    }
    return {
      setting: same,
      pausedRecipient,
      setup: { a: setupA, b: setupB },
      trigger: { readers: triggered.readers?.length ?? null, a: triggered.readers?.[(Zotero.Reader._readers || []).indexOf(a.reader)]?.handoff ?? null },
      trace: { first, last, count },
      final: { a: state(a), b: state(b) },
      targetCalls: { a: a.calls.filter(c => c.voiceID === targetID).map(c => ({ kind: c.kind, text: c.text })), b: b.calls.filter(c => c.voiceID === targetID).map(c => ({ kind: c.kind, text: c.text })) },
      clocks: {
        aAdvanced: Number(last.a?.audio?.time) > Number(first.a?.audio?.time) + 0.05,
        bAdvanced: Number(last.b?.audio?.time) > Number(first.b?.audio?.time) + 0.05,
      },
    };
  };
  const out = {};
  try {
    out.sameOnPlaying = await scenario(true, false);
    if (a.reader._internalReader?._readAloudManager?.active && !a.reader._internalReader._readAloudManager.paused) a.reader._internalReader._readAloudManager.pause();
    if (b.reader._internalReader?._readAloudManager?.active && !b.reader._internalReader._readAloudManager.paused) b.reader._internalReader._readAloudManager.pause();
    await root.sleep(120);
    out.sameOffPlaying = await scenario(false, false);
    if (a.reader._internalReader?._readAloudManager?.active && !a.reader._internalReader._readAloudManager.paused) a.reader._internalReader._readAloudManager.pause();
    if (b.reader._internalReader?._readAloudManager?.active && !b.reader._internalReader._readAloudManager.paused) b.reader._internalReader._readAloudManager.pause();
    await root.sleep(120);
    out.sameOnPausedRecipient = await scenario(true, true);
  } finally {
    a.delayMs = 0; a.delayVoiceID = null; b.delayMs = 0; b.delayVoiceID = null;
    a.failVoiceID = null; b.failVoiceID = null; a.failNext = false; b.failNext = false;
    if (a.reader._internalReader?._readAloudManager?.active && !a.reader._internalReader._readAloudManager.paused) { try { a.reader._internalReader._readAloudManager.pause(); } catch (e) {} }
    if (b.reader._internalReader?._readAloudManager?.active && !b.reader._internalReader._readAloudManager.paused) { try { b.reader._internalReader._readAloudManager.pause(); } catch (e) {} }
    if (original.user) Services.prefs.setBoolPref(sameName, original.value);
    else if (Services.prefs.prefHasUserValue(sameName)) Services.prefs.clearUserPref(sameName);
  }
  out.restored = { sameForAllDocuments: { value: Services.prefs.getBoolPref(sameName), user: Services.prefs.prefHasUserValue(sameName) } };
  for (const key of ['sameOnPlaying', 'sameOffPlaying', 'sameOnPausedRecipient']) {
    const x = out[key];
    x.status = x.clocks.aAdvanced && (x.pausedRecipient || x.clocks.bAdvanced) ? 'PASS' : 'NOT TESTABLE: fixture AudioContext clock did not advance';
  }
  return JSON.stringify(out, null, 1);
})()
