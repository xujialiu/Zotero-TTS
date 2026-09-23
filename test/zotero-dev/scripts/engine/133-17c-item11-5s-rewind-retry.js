// Item 11, the >=5s "one word back" sub-case only, retried at several real
// pause points. 133-17b proved the mechanism is wired correctly end to end
// (exact resume under 5s; a clear rewind, further than the 5s case, at
// >=20s) but its own >=5s attempt landed where the real Kokoro audio (real
// speech, energy-based search, word-onset.ts copied from Zotero) had no
// clean >=80ms silence within the 1.5s lookback, so `findWordOnset` fell
// back to the unchanged position -- correct behavior of the copied
// algorithm, not evidence either way for the "one word back" outcome. This
// tries a few pause points (two segments, two offsets each) and keeps the
// first that shows a real rewind, reporting every attempt.
// params: none. state: reads fixtures.A; writes item11 (resumeAfter5s only).
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
  const resumeAndReadCorrected = async (settleMs) => {
    const tPlay = Date.now();
    m.play();
    await sleep(settleMs);
    const e = await engineFor();
    const elapsedS = (Date.now() - tPlay) / 1000;
    return { raw: e.session.playbackTime, elapsedS, corrected: e.session.playbackTime - elapsedS, playing: e.session.playing };
  };

  m.setSpeed(1);
  const attempts = [];
  const plan = [{ seg: 7, settleMs: 3000 }, { seg: 6, settleMs: 3500 }, { seg: 10, settleMs: 4500 }, { seg: 7, settleMs: 6500 }];
  let success = null;
  for (const p of plan) {
    m.repositionTo(p.seg);
    await waitPlayingIndex(p.seg, 20000);
    await sleep(p.settleMs);
    const before = await engineFor();
    m.pause();
    await sleep(5300);
    const resumed = await resumeAndReadCorrected(120);
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    const attempt = {
      segment: p.seg, settleMs: p.settleMs,
      pausedPlaybackTime: before.session.playbackTime,
      ...resumed,
      movedBack: resumed.corrected < before.session.playbackTime - 0.05,
      rewindSeconds: before.session.playbackTime - resumed.corrected,
    };
    attempts.push(attempt);
    if (attempt.movedBack && !success) success = attempt;
    if (success) break;
  }

  const out = { step: 'item11-5s-rewind-retry', attempts, success: !!success, resumeAfter5s: success || attempts[attempts.length - 1] };
  S.item11 = Object.assign({}, S.item11 || {}, { resumeAfter5sRetry: out });
  if (success) S.item11.resumeAfter5s = Object.assign({}, S.item11.resumeAfter5s, success, { supersededBy: '133-17c (a real silence gap found at this pause point)' });
  return JSON.stringify(out, null, 1);
})();
