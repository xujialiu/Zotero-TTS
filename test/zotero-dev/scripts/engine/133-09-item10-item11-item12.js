// Item 10: skip (sentence +-1, +-5 with accelerate; paragraph rules;
// clamped to the document; skipPending true for the SKIP_DEBOUNCE_MS=600 ms
// debounce; while paused only the highlight/position moves, nothing is
// fetched). Item 11: pause and resume (a hard cut with the lit word kept;
// resume within 5s at the exact place, after 5s one word back, after 20s two
// -- en voices only, so this switches to an English Fish voice while idle;
// paused while buffering plays the sentence from its start). Item 12:
// buffering and "Preparing..." (session.buffering; notices.shown after
// PREPARING_AFTER_MS=300; a skip's own wait).
// params: none. state: reads fixtures.A; writes item10, item11, item12.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out10 = { step: 'item10-skip' };
  const out11 = { step: 'item11-pause-resume' };
  const out12 = { step: 'item12-buffering-preparing' };
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found');
  const ir = r._internalReader;
  let m = ir._readAloudManager;
  const mw = Components.utils.waiveXrays(m);

  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };
  const waitPlayingIndex = async (index, ceilingMs = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs) { const e = await engineFor(); if (e.session.currentIndex === index && e.session.playing) return e; await sleep(20); }
    return await engineFor();
  };

  // A pure copy of core/engine/skip.ts, to predict the target rather than
  // hand-trace the paragraph loop (it counts a mid-paragraph position as one
  // extra hop back to the PREVIOUS paragraph, on top of returning to the
  // current paragraph's own start -- easy to get wrong by hand).
  const isParagraphStart = (seg) => seg && seg.anchor === 'paragraphStart';
  function skipBackTarget(segs, position, granularity, accelerate) {
    let delta = accelerate ? 5 : 1;
    let target;
    if (granularity === 'sentence') { target = position - delta; }
    else {
      target = position;
      if (!isParagraphStart(segs[target])) delta++;
      for (let i = 0; i < delta; i++) {
        let previous = -1;
        for (let j = Math.min(target, segs.length) - 1; j >= 0; j--) if (isParagraphStart(segs[j])) { previous = j; break; }
        if (previous === -1) { target = 0; break; }
        target = previous;
      }
    }
    return Math.max(target, 0);
  }
  function skipAheadTarget(segs, position, granularity, accelerate) {
    const delta = accelerate ? 5 : 1;
    let target;
    if (granularity === 'sentence') { target = position + delta; }
    else {
      target = position;
      for (let i = 0; i < delta; i++) {
        let next = -1;
        for (let j = Math.max(target + 1, 0); j < segs.length; j++) if (isParagraphStart(segs[j])) { next = j; break; }
        if (next === -1) { target = segs.length - 1; break; }
        target = next;
      }
    }
    return Math.min(target, segs.length - 1);
  }
  const segsPlain = (() => {
    const raw = ir._readAloudSegments.segments;
    const out = [];
    for (let i = 0; i < raw.length; i++) out.push({ anchor: raw[i].anchor || null });
    return out;
  })();

  // --- Item 10: skip ahead / back, sentence and paragraph, accelerate, clamp ---
  const skipCases = [
    { from: 2, call: 'skipAhead', granularity: 'sentence', accelerate: false },
    { from: 2, call: 'skipAhead', granularity: 'sentence', accelerate: true },
    { from: 8, call: 'skipAhead', granularity: 'paragraph', accelerate: false },
    { from: 8, call: 'skipBack', granularity: 'paragraph', accelerate: false },
    { from: 16, call: 'skipAhead', granularity: 'sentence', accelerate: true }, // clamp at the end
    { from: 1, call: 'skipBack', granularity: 'sentence', accelerate: true }, // clamp at the start
  ];
  const skipResults = [];
  for (const c of skipCases) {
    m.setSpeed(1);
    m.repositionTo(c.from);
    await waitPlayingIndex(c.from, 15000);
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} } // paused: only the highlight/position moves, nothing fetched
    const before = await engineFor();
    const requestsBefore = before.session.store.requests;
    const expected = c.call === 'skipAhead'
      ? skipAheadTarget(segsPlain, c.from, c.granularity, c.accelerate)
      : skipBackTarget(segsPlain, c.from, c.granularity, c.accelerate);
    const tSkip = Date.now();
    mw[c.call](c.granularity, c.accelerate);
    const justAfter = await engineFor();
    await sleep(650); // past the 600 ms skip debounce
    const settled = await engineFor();
    skipResults.push({
      ...c, expected,
      positionAtOnce: justAfter.session.position, // moves at once, even while the debounce is pending
      skipPendingAtOnce: justAfter.session.skipPending,
      requestsWhilePaused: justAfter.session.store.requests - requestsBefore, // paused: nothing fetched by the "at once" jump
      positionAfterDebounce: settled.session.position,
      debounceMs: Date.now() - tSkip,
      landedOnExpected: settled.session.position === expected,
    });
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  }
  out10.skipResults = skipResults;
  out10.allLandedOnExpected = skipResults.every((s) => s.landedOnExpected);
  out10.allMovedAtOnce = skipResults.every((s) => s.positionAtOnce === s.expected);
  out10.pausedSkipFetchedNothing = skipResults.every((s) => s.requestsWhilePaused === 0);

  // --- Item 11: pause/resume, an English Fish voice (the word-boundary
  // rewind is en-only, reader.js 40206) ---
  const voices = mw.allVoices;
  let enVoiceID = null;
  for (let i = 0; i < voices.length; i++) {
    const v = Components.utils.waiveXrays(voices[i]);
    if (typeof v.id === 'string' && v.id.startsWith('fish::en/')) { enVoiceID = v.id; break; }
  }
  out11.enVoiceFound = !!enVoiceID;
  if (enVoiceID) {
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    try { ir.toggleReadAloudPopup(false); } catch (e) {}
    for (let i = 0; i < 100; i++) { m = ir._readAloudManager; if (!m.active) break; await sleep(50); }
    m.selectVoice(enVoiceID); // idle: the direct Zotero path, not the handoff
    out11.selectedWhileIdle = m.selectedVoiceID;
    try { ir.toggleReadAloudPopup(true); } catch (e) {}
    for (let i = 0; i < 200; i++) { m = ir._readAloudManager; if (m.active) break; await sleep(50); }
    m.setSpeed(1);
    m.repositionTo(6);
    await waitPlayingIndex(6, 20000);
    await sleep(400);

    out11.voiceActuallyUsed = (await engineFor()).session.voice; // confirms the EN pick survived reactivation's persisted-voice sync
    // A hard cut with the lit word kept
    const beforePause = await engineFor();
    m.pause();
    await sleep(150);
    const justPaused = await engineFor();
    out11.hardCutWordKept = {
      wordIndexBefore: beforePause.session.activeTimestampIndex,
      wordIndexAfterPause: justPaused.session.activeTimestampIndex,
      unchanged: beforePause.session.activeTimestampIndex === justPaused.session.activeTimestampIndex,
      playbackTimeFrozen: beforePause.session.playbackTime <= justPaused.session.playbackTime + 0.01 && justPaused.session.playing === false,
    };
    const pausedOffset = justPaused.session.playbackTime;

    // Resume within 5 s: the exact place
    m.play();
    await sleep(150);
    const resumeUnder5s = await engineFor();
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    out11.resumeUnder5s = { pausedOffset, resumedPlaybackTime: resumeUnder5s.session.playbackTime, exact: Math.abs(resumeUnder5s.session.playbackTime - pausedOffset) < 0.05 };

    // Pause again at (about) the same place, wait > 5 s, resume: one word back
    m.repositionTo(6);
    await waitPlayingIndex(6, 20000);
    await sleep(400);
    const before5 = await engineFor();
    m.pause();
    await sleep(5300);
    m.play();
    await sleep(200);
    const after5 = await engineFor();
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    out11.resumeAfter5s = { pausedPlaybackTime: before5.session.playbackTime, resumedPlaybackTime: after5.session.playbackTime, movedBack: after5.session.playbackTime < before5.session.playbackTime - 0.02 };

    // Pause again, wait > 20 s, resume: two words back (further than the 5 s case)
    m.repositionTo(6);
    await waitPlayingIndex(6, 20000);
    await sleep(400);
    const before20 = await engineFor();
    m.pause();
    await sleep(20300);
    m.play();
    await sleep(200);
    const after20 = await engineFor();
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    out11.resumeAfter20s = {
      pausedPlaybackTime: before20.session.playbackTime, resumedPlaybackTime: after20.session.playbackTime,
      movedBack: after20.session.playbackTime < before20.session.playbackTime - 0.02,
      movedBackFurtherThan5s: (before20.session.playbackTime - after20.session.playbackTime) >= (out11.resumeAfter5s.pausedPlaybackTime - out11.resumeAfter5s.resumedPlaybackTime) - 0.02,
    };
  }

  // --- Item 12: buffering and store.requests bookkeeping around a skip's own wait ---
  m.setSpeed(1);
  m.repositionTo(3);
  await waitPlayingIndex(3, 15000);
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  const bufferSamples = [];
  const notice0 = await engineFor();
  mw.skipAhead('sentence', false); // -> segment 4, cached, but exercises the same wait/notice path
  const tB0 = Date.now();
  while (Date.now() - tB0 < 1200) { const e = await engineFor(); bufferSamples.push({ t: Date.now() - tB0, buffering: e.session.buffering, waits: e.session.notices.waits, shown: e.session.notices.shown, starts: e.session.notices.starts }); await sleep(15); }
  const noticeEnd = await engineFor();
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  out12.PREPARING_AFTER_MS_source = 300; // core/engine/session.ts
  out12.bufferingSeenTrue = bufferSamples.some((s) => s.buffering);
  out12.waitsRoseOnSkip = noticeEnd.session.notices.waits > notice0.session.notices.waits;
  out12.shownRoseEarlierInRun = 'see item2 (133-02): notices.shown went 0 -> 1 on the very first, genuinely slow fetch of this run';
  out12.notices = { before: notice0.session.notices, after: noticeEnd.session.notices };

  S.item10 = out10;
  S.item11 = out11;
  S.item12 = out12;
  return JSON.stringify({ item10: out10, item11: out11, item12: out12 }, null, 1);
})();
