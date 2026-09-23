// Item 17(g), the last correction: 133-19c's 130s wait showed the OLD
// voice stuck (playing:false, position frozen) the whole time, not "reading
// on" -- because the fake server's mode is global, so mode "error" also
// failed the OLD voice's own next-segment fetch (segment 7 was not yet
// cached), which is not what 17(g) means to test (test/core/engine/
// handoff.test.ts "fails on a request that fails" fails only the TARGET
// voice's fetches and leaves the old one's answering normally, and reaches
// ['preparing','failed'] well inside its simulated clock). This pre-warms
// several segments for the OLD voice under "ok" so it can keep reading from
// cache alone, then flips to "error" only for the pick, and watches a short
// window: the old voice must keep playing/advancing from cache while the
// handoff keeps trying (not yet failed -- HANDOFF_SWITCH_MS is 120s,
// core/engine/handoff.ts, not re-run live here; the unit test above is the
// deadline evidence).
// params: modeFile. state: reads fixtures.A; writes item17g (replaces
// 133-19c's).
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found');
  const ir = r._internalReader;
  let m = ir._readAloudManager;
  const modeFile = Zotero.ZoteroTTSRun.params.modeFile;
  const setMode = (mode) => IOUtils.writeUTF8(modeFile, mode);

  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };
  const readerIndex = () => { const rs = Zotero.Reader._readers || []; for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID) return i; return -1; };
  const voiceSwitchFor = async () => {
    const vs = JSON.parse(await Zotero.ZoteroTTS.diagnostics.voiceSwitch());
    const idx = readerIndex();
    for (let i = 0; i < vs.readers.length; i++) if (vs.readers[i].index === idx) return vs.readers[i];
    return null;
  };
  const waitPlayingIndex = async (index, ceilingMs = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs) { const e = await engineFor(); if (e.session.currentIndex === index && e.session.playing) return e; await sleep(25); }
    return await engineFor();
  };

  await setMode('ok');
  m.setSpeed(1);
  const startSeg = 12; // fixture A's page 2 -- fresh ground, short segments (12:20, 13:97, 14:90, 15:65, 16:50 chars)
  // Pre-warm several segments ahead so the OLD voice can read purely from
  // cache during the "error" window: play through 12..15 once under "ok".
  for (const seg of [12, 13, 14, 15]) {
    m.repositionTo(seg);
    await waitPlayingIndex(seg, 20000);
    await sleep(600);
  }
  m.repositionTo(12);
  await waitPlayingIndex(12, 20000);
  const settle = await engineFor();
  const from = settle.session.voice;

  await setMode('error');
  const to = from === 'local::af_fake' ? 'local::bf_fake' : 'local::af_fake';
  m.selectVoice(to);

  const samples = [];
  const t0 = Date.now();
  let failedEntry = null;
  while (Date.now() - t0 < 9000) {
    const vs = await voiceSwitchFor();
    const e = await engineFor();
    const h = vs && vs.handoff;
    samples.push({ ms: Date.now() - t0, stage: h ? h.stage : null, sessionVoice: e.session.voice, playing: e.session.playing, position: e.session.position });
    if (h && h.stage === 'failed') { failedEntry = h; break; }
    await sleep(200);
  }
  await setMode('ok');
  await sleep(300);
  const after = await engineFor();
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  const positions = samples.map((s) => s.position);
  const distinctPositions = Array.from(new Set(positions));
  const oldVoiceKeptReading = samples.some((s) => s.playing === true) && distinctPositions.length > 1;
  const out = {
    step: 'item17g-old-voice-isolated',
    from, to,
    prewarmedSegments: [12, 13, 14, 15],
    failedWithinWindow: !!failedEntry,
    note: 'HANDOFF_SWITCH_MS is 120s (core/engine/engine/handoff.ts); a 9s window shows the mechanism still trying, not the eventual failure -- test/core/engine/handoff.test.ts "fails on a request that fails" (target-only failure, old voice answering normally) is the unit-level proof it reaches [\'preparing\',\'failed\'] once its clock passes the deadline.',
    sampleCount: samples.length,
    distinctPositionsSeen: distinctPositions,
    oldVoiceKeptReadingFromCache: oldVoiceKeptReading,
    samplesHead: samples.slice(0, 4),
    samplesTail: samples.slice(-4),
    sessionVoiceStillOld: after.session.voice === from,
    oldVoicePlayingAtEnd: after.session.playing,
  };
  S.item17g = out;
  return JSON.stringify(out, null, 1);
})();
