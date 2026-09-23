// Item 11, REVISED: the first attempt (133-17, its resume sub-tests) paused
// too close to the start of a short clip (segment 6, position ~0.5s): the
// backward energy search's lookback (1.5s * wordBoundaries, word-onset.ts)
// clamps to 0 from such an early position, so the 1-word-back and
// 2-word-back searches covered the identical [0, position] range and
// necessarily returned the identical onset -- not a product fault, a test
// setup one. This redoes the three resume-offset sub-cases on segment 7
// (132 chars, the fixture's longest, several seconds of real audio) paused
// ~5s in, so the two lookback windows (1.5s / 3s) genuinely differ; and
// reads playbackTime with the real elapsed time since Play subtracted out
// (speed 1, so 1:1), instead of a fixed tolerance against the raw value,
// since normal playback keeps advancing during the round trip back from
// Play. Segment 6's hardCutWordKept and the paused-while-buffering case
// (133-17's own segment 11) already stand and are not repeated.
// params: none. state: reads fixtures.A; writes item11 (replaces 133-17's
// resumeUnder5s/resumeAfter5s/resumeAfter20s; hardCutWordKept and
// pausedWhileBuffering are carried over unchanged from state.item11).
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out11 = Object.assign({ step: 'item11-pause-resume-real-en-fixed' }, S.item11 || {});
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
  // Resume, then read playbackTime with the elapsed real time (at speed 1)
  // since the Play call subtracted out, so ordinary forward progress during
  // the round trip does not masquerade as "did not resume where expected".
  const resumeAndReadCorrected = async (settleMs) => {
    const tPlay = Date.now();
    m.play();
    await sleep(settleMs);
    const e = await engineFor();
    const elapsedS = (Date.now() - tPlay) / 1000; // speed is 1 throughout this script
    return { raw: e.session.playbackTime, elapsedS, corrected: e.session.playbackTime - elapsedS, playing: e.session.playing };
  };
  const voice = (await engineFor()).session.voice;
  out11.voiceUsedForTimingRetry = voice;

  m.setSpeed(1);

  // --- Exact resume (<5s pause) ---
  m.repositionTo(7);
  await waitPlayingIndex(7, 20000);
  await sleep(5000); // well into the clip -- both lookback windows will differ from here on
  const beforeExact = await engineFor();
  m.pause();
  await sleep(150);
  const pausedExact = await engineFor();
  await sleep(2000); // still under 5s
  const resumedExact = await resumeAndReadCorrected(120);
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  out11.resumeUnder5s = {
    pausedOffset: pausedExact.session.playbackTime,
    ...resumedExact,
    exact: Math.abs(resumedExact.corrected - pausedExact.session.playbackTime) < 0.1,
  };

  // --- >=5s: one word back ---
  m.repositionTo(7);
  await waitPlayingIndex(7, 20000);
  await sleep(5000);
  const before5 = await engineFor();
  m.pause();
  await sleep(5300);
  const resumed5 = await resumeAndReadCorrected(120);
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  out11.resumeAfter5s = {
    pausedPlaybackTime: before5.session.playbackTime,
    ...resumed5,
    movedBack: resumed5.corrected < before5.session.playbackTime - 0.05,
    rewindSeconds: before5.session.playbackTime - resumed5.corrected,
  };

  // --- >=20s: two words back (should rewind at least as far as the 5s case, typically further) ---
  m.repositionTo(7);
  await waitPlayingIndex(7, 20000);
  await sleep(5000);
  const before20 = await engineFor();
  m.pause();
  await sleep(20300);
  const resumed20 = await resumeAndReadCorrected(120);
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  out11.resumeAfter20s = {
    pausedPlaybackTime: before20.session.playbackTime,
    ...resumed20,
    movedBack: resumed20.corrected < before20.session.playbackTime - 0.05,
    rewindSeconds: before20.session.playbackTime - resumed20.corrected,
    rewindAtLeastAsFarAs5s: (before20.session.playbackTime - resumed20.corrected) >= (out11.resumeAfter5s.rewindSeconds - 0.08),
    rewindFurtherThan5s: (before20.session.playbackTime - resumed20.corrected) > (out11.resumeAfter5s.rewindSeconds + 0.08),
  };

  S.item11 = out11;
  return JSON.stringify(out11, null, 1);
})();
