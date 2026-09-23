// Item 24, paused variant, verify half: run immediately after a REAL
// in-place zotero_plugin_install of the same xpi (done at the tester's own
// level between 133-30 and this script -- a sandboxed script cannot
// reinstall the plugin itself). Expects, in the fresh instance: stats
// reset to small numbers with adopted 1, controller.ours/live true,
// session.paused true at the SAME position 133-30 left it, no sound
// (audio.state 'none' or unstarted, store.requests 0) -- then Play resumes
// there.
// params: none. state: reads fixtures.A, item24Setup (133-30); writes
// item24Verify.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found (a real reinstall must not have dropped the tab)');
  const ir = r._internalReader;
  let m = ir._readAloudManager;

  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };

  const setup = S.item24Setup || {};
  const immediatelyAfter = await engineFor();
  const noSound = immediatelyAfter.session.playing === false && immediatelyAfter.session.store.requests === 0;

  m.play();
  let played = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) { const e = await engineFor(); if (e.session.playing) { played = e; break; } await sleep(50); }
  m = ir._readAloudManager;
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  const out = {
    step: 'item24-paused-verify',
    adoptedIsOne: immediatelyAfter.stats.adopted === 1,
    stats: immediatelyAfter.stats,
    controllerOurs: immediatelyAfter.controller ? immediatelyAfter.controller.ours : null,
    controllerLive: immediatelyAfter.controller ? immediatelyAfter.controller.live : null,
    stillPausedSamePosition: immediatelyAfter.session.paused === true && immediatelyAfter.session.position === setup.position,
    noSoundBeforePlay: noSound,
    audioStateBeforePlay: immediatelyAfter.audio.state,
    playResumed: !!played,
    playedAtCurrentIndex: played ? played.session.currentIndex : null,
    playedAtSamePosition: played ? played.session.currentIndex === setup.position : null,
  };
  S.item24Verify = out;
  return JSON.stringify(out, null, 1);
})();
