// Item 24, paused variant, setup half: fixture A back to a plain fish
// voice (off the fake local provider, native pick while paused so it
// applies at once), a short real play, then paused at a known position.
// The actual in-place reinstall happens between this script and its
// "-verify" counterpart, through zotero_plugin_install at the tester's own
// level (a real reinstall, not something a sandboxed script can do).
// params: none. state: reads fixtures.A; writes item24Setup.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found');
  const ir = r._internalReader;
  let m = ir._readAloudManager;

  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };
  const waitPlayingIndex = async (index, ceilingMs = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs) { const e = await engineFor(); if (e.session.currentIndex === index && e.session.playing) return e; await sleep(25); }
    return await engineFor();
  };

  if (!m.paused) { m.pause(); await sleep(200); m = ir._readAloudManager; }
  m.selectTier('fish'); // native while paused -- applies at once, no fake-provider entanglement
  await sleep(300);
  m = ir._readAloudManager;

  r._iframeWindow.document.notifyUserGestureActivation();
  m.setSpeed(1);
  m.play();
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) { const e = await engineFor(); if (e.session.playing) break; await sleep(50); }
  m = ir._readAloudManager;
  m.repositionTo(3);
  await waitPlayingIndex(3, 20000);
  await sleep(600); // a moment of real audio, so the pause is mid-sentence like the case describes
  m = ir._readAloudManager;
  m.pause();
  await sleep(300);
  const paused = await engineFor();

  const out = {
    step: 'item24-paused-setup',
    selectedVoiceID: m.selectedVoiceID,
    isPluginVoice: typeof m.selectedVoiceID === 'string' && m.selectedVoiceID.includes('::') && m.selectedVoiceID.startsWith('fish::'),
    position: paused.session.position,
    currentIndex: paused.session.currentIndex,
    paused: paused.session.paused,
    playing: paused.session.playing,
    statsBefore: paused.stats,
    audioStateBefore: paused.audio.state,
  };
  S.item24Setup = out;
  return JSON.stringify(out, null, 1);
})();
