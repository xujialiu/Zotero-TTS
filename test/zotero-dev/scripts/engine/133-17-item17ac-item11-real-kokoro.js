// Run 2 (issue #133, live run 2): item 17 as its own dedicated check, parts
// (a) and (c), plus item 11's en-only pause/resume rewind -- all three need
// the manager ACTIVE when the voice is picked (driving notes SS3: an idle
// pick is overwritten at the next activation), so this does every pick
// while fixture A is genuinely playing, through the Handoff.
//
// 17(c): cross-provider, `selectTier('kokoro')` while playing (fish -> the
// owner's real Kokoro server, already pointed at by local.baseURL; this
// script only flips local.enabled on).
// 17(a): same-provider, both voices with word timings: local::<whatever
// 17c landed on> -> local::af_bella (or af_nicole if already there).
// Item 11: on that real English (`lang` starts with "en") Kokoro voice --
// hard cut keeps the lit word; resume <5s exact, >=5s one word back, >=20s
// two; paused-while-buffering plays the sentence from its start.
//
// params: none (uses the already-true local.enabled from this run's setup).
// state: reads fixtures.A; writes item17ac, item11.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out17 = { step: 'item17ac-real-kokoro' };
  const out11 = { step: 'item11-pause-resume-real-en' };
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
  const voiceSwitchFor = async () => {
    const vs = JSON.parse(await Zotero.ZoteroTTS.diagnostics.voiceSwitch());
    for (let i = 0; i < vs.readers.length; i++) if (vs.readers[i].index === indexOfReader()) return vs.readers[i];
    return null;
  };
  const indexOfReader = () => {
    const readers = Zotero.Reader._readers || [];
    for (let i = 0; i < readers.length; i++) if (readers[i].itemID === itemID) return i;
    return -1;
  };
  const waitPlayingIndex = async (index, ceilingMs = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs) { const e = await engineFor(); if (e.session.currentIndex === index && e.session.playing) return e; await sleep(25); }
    return await engineFor();
  };
  const waitHandoff = async (pred, ceilingMs = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs) {
      const vs = await voiceSwitchFor();
      const e = await engineFor();
      if (pred(vs, e)) return { vs, e, ms: Date.now() - t0 };
      await sleep(25);
    }
    return { vs: await voiceSwitchFor(), e: await engineFor(), ms: Date.now() - t0, timedOut: true };
  };
  const toastText = () => {
    try {
      const doc = r._iframeWindow.document;
      const el = doc.getElementById('ztts-voice-notice');
      return el ? { present: true, text: el.textContent, opacity: el.style.opacity } : { present: false };
    } catch (e) { return { present: false, error: String(e) }; }
  };

  // Get to a known-fresh position, at speed 1, before starting
  m.setSpeed(1);
  m.repositionTo(2);
  await waitPlayingIndex(2, 20000);
  out17.startedFrom = (await engineFor()).session.voice;

  // --- 17(c): cross-provider via selectTier('kokoro') while playing ---
  const before17c = await engineFor();
  out17.statsBeforeC = before17c.stats;
  m.selectTier('kokoro');
  await sleep(60); // catch the "Preparing voice" toast before it can be replaced
  out17.toastDuringC = toastText();
  const afterC = await waitHandoff((vs) => vs && vs.handoff && vs.handoff.stage === 'committed', 25000);
  out17.crossProvider = {
    timedOut: !!afterC.timedOut,
    stage: afterC.vs && afterC.vs.handoff ? afterC.vs.handoff.stage : null,
    last: afterC.vs && afterC.vs.handoff ? afterC.vs.handoff.last : null,
    notice: afterC.vs && afterC.vs.handoff ? afterC.vs.handoff.notice : null,
    sessionVoice: afterC.e.session.voice,
    landedOnKokoro: typeof afterC.e.session.voice === 'string' && afterC.e.session.voice.startsWith('local::'),
    carriedOnDelta: afterC.e.stats.carriedOn - before17c.stats.carriedOn,
    startedUnchanged: afterC.e.stats.started === before17c.stats.started,
    playing: afterC.e.session.playing,
  };
  await sleep(300);
  out17.toastAfterCSettled = toastText(); // "the notice gone"

  // --- 17(a): same-provider, both voices with word timings ---
  const landedVoice = afterC.e.session.voice; // "local::<id>"
  const targetID = landedVoice === 'local::af_bella' ? 'local::af_nicole' : 'local::af_bella';
  const before17a = await engineFor();
  m.selectVoice(targetID);
  await sleep(60);
  out17.toastDuringA = toastText();
  const afterA = await waitHandoff((vs) => vs && vs.handoff && vs.handoff.stage === 'committed', 25000);
  out17.sameProvider = {
    from: landedVoice, to: targetID,
    timedOut: !!afterA.timedOut,
    stage: afterA.vs && afterA.vs.handoff ? afterA.vs.handoff.stage : null,
    last: afterA.vs && afterA.vs.handoff ? afterA.vs.handoff.last : null,
    lastKindIsWord: !!(afterA.vs && afterA.vs.handoff && afterA.vs.handoff.last && afterA.vs.handoff.last.kind === 'word'),
    notice: afterA.vs && afterA.vs.handoff ? afterA.vs.handoff.notice : null,
    sessionVoice: afterA.e.session.voice,
    matchesTarget: afterA.e.session.voice === targetID,
    carriedOnDelta: afterA.e.stats.carriedOn - before17a.stats.carriedOn,
    startedUnchanged: afterA.e.stats.started === before17c.stats.started,
    playing: afterA.e.session.playing,
  };
  await sleep(300);
  out17.toastAfterASettled = toastText();

  // --- Item 11: pause/resume rewind, en-only, on this real Kokoro voice ---
  const enVoiceID = afterA.e.session.voice;
  out11.voiceUsed = enVoiceID;
  m.setSpeed(1);
  m.repositionTo(6);
  await waitPlayingIndex(6, 25000);
  await sleep(500);
  out11.voiceActuallyUsedAt6 = (await engineFor()).session.voice; // confirms the pick survived (active-manager pick, not idle)

  // A hard cut with the lit word kept
  const beforePause = await engineFor();
  m.pause();
  await sleep(150);
  const justPaused = await engineFor();
  out11.hardCutWordKept = {
    wordIndexBefore: beforePause.session.activeTimestampIndex,
    wordIndexAfterPause: justPaused.session.activeTimestampIndex,
    unchanged: beforePause.session.activeTimestampIndex === justPaused.session.activeTimestampIndex,
    stoppedPlaying: justPaused.session.playing === false,
  };
  const pausedOffset = justPaused.session.playbackTime;

  // Resume within 5s: the exact place
  m.play();
  await sleep(150);
  const resumeUnder5s = await engineFor();
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  out11.resumeUnder5s = { pausedOffset, resumedPlaybackTime: resumeUnder5s.session.playbackTime, exact: Math.abs(resumeUnder5s.session.playbackTime - pausedOffset) < 0.05 };

  // Pause again at (about) the same place, wait > 5s: one word back
  m.repositionTo(6);
  await waitPlayingIndex(6, 20000);
  await sleep(500);
  const before5 = await engineFor();
  m.pause();
  await sleep(5300);
  m.play();
  await sleep(200);
  const after5 = await engineFor();
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  out11.resumeAfter5s = { pausedPlaybackTime: before5.session.playbackTime, resumedPlaybackTime: after5.session.playbackTime, movedBack: after5.session.playbackTime < before5.session.playbackTime - 0.02 };

  // Pause again, wait > 20s: two words back (further than the 5s case)
  m.repositionTo(6);
  await waitPlayingIndex(6, 20000);
  await sleep(500);
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

  // Paused while buffering: skip to a never-yet-fetched segment, pause immediately (before audio arrives), resume -> starts at 0
  m.setSpeed(1);
  m.repositionTo(11);
  await sleep(30); // before the fetch resolves -- still buffering
  const whilePausing = await engineFor();
  m.pause();
  await sleep(250);
  const pausedWhileBuffering = await engineFor();
  m.play();
  const played11 = await waitPlayingIndex(11, 20000);
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  out11.pausedWhileBuffering = {
    wasBufferingWhenPaused: whilePausing.session.buffering === true || pausedWhileBuffering.session.buffering === true,
    playbackTimeAtResumeStart: played11.session.playbackTime,
    startedFromZero: played11.session.playbackTime < 0.15,
  };

  S.item17ac = out17;
  S.item11 = out11;
  return JSON.stringify({ item17ac: out17, item11: out11 }, null, 1);
})();
