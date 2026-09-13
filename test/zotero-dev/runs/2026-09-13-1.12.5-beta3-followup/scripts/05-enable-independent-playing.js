return (async () => {
  const root = Zotero.__ztts95Followup;
  if (!root?.fixtures.a?.reader || !root.fixtures.b?.reader) throw new Error('both fixtures are required');
  const out = {};
  for (const key of ['a', 'b']) {
    const fixture = root.fixtures[key];
    const manager = fixture.reader._internalReader?._readAloudManager;
    const internal = fixture.reader._internalReader;
    const options = Components.utils.waiveXrays(manager?._options);
    if (!manager || !internal || !options) throw new Error('fixture manager options are missing: ' + key);
    if (!fixture.originalStatusCallback) fixture.originalStatusCallback = options.onSetReadAloudStatus;
    if (!fixture.originalInternalStatusCallback) fixture.originalInternalStatusCallback = internal._onSetReadAloudStatus;
    fixture.statusCalls = [];
    const guard = status => {
      try { fixture.statusCalls.push({ active: !!status?.active, paused: !!status?.paused, at: Date.now() }); } catch (e) {}
      try { fixture.reader._readAloudPlaying = !!status?.active && !status?.paused; fixture.reader._updateDocShellActivity?.(); } catch (e) {}
    };
    fixture.statusGuard = Components.utils.exportFunction(guard, options);
    fixture.statusGuardInternal = Components.utils.exportFunction(guard, internal);
    options.onSetReadAloudStatus = fixture.statusGuard;
    internal._onSetReadAloudStatus = fixture.statusGuardInternal;
  }
  Services.prefs.setBoolPref('extensions.zotero.zotero-tts.readAloud.sameForAllDocuments', false);
  root.fixtures.a.delayMs = 0; root.fixtures.a.delayVoiceID = null;
  root.fixtures.b.delayMs = 0; root.fixtures.b.delayVoiceID = null;
  await root.activate(root.fixtures.a, root.voices[0], true);
  await root.activate(root.fixtures.b, root.voices[0], true);
  await root.sleep(300);
  const a = root.read(root.fixtures.a), b = root.read(root.fixtures.b);
  const clocks = { a: { state: a.audio.state, time: a.audio.time }, b: { state: b.audio.state, time: b.audio.time } };
  out.setup = { a, b, statusCalls: { a: root.fixtures.a.statusCalls?.slice(-4) ?? [], b: root.fixtures.b.statusCalls?.slice(-4) ?? [] }, clocks };
  out.bothActivePlaying = a.active && !a.paused && b.active && !b.paused;
  out.clockAdvanced = false;
  out.status = out.bothActivePlaying && (a.audio.state !== 'running' || b.audio.state !== 'running') ? 'NOT TESTABLE: independent managers are active but fresh AudioContexts are suspended' : out.bothActivePlaying ? 'READY' : 'FAIL: fixture status guard did not keep both managers playing';
  return JSON.stringify(out, null, 1);
})()
