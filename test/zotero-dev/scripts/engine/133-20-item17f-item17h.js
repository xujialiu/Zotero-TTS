// Item 17(f) (a paused pick: silent preparation, "ready" once the paused
// word is known, Play starts the new voice at the next word) and item
// 17(h) (a provider/language pick while paused goes native at once; Play
// starts the sentence over). Both from a PAUSED session, per the case's
// own split (a voice pick keeps the paused handoff of #108; a provider or
// language pick while paused is left to Zotero, issue #110).
// params: none. state: reads fixtures.A (paused, on local::af_fake per
// 133-19d); writes item17f, item17h.
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
  const readerIndex = () => { const rs = Zotero.Reader._readers || []; for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID) return i; return -1; };
  const voiceSwitchFor = async () => {
    const vs = JSON.parse(await Zotero.ZoteroTTS.diagnostics.voiceSwitch());
    const idx = readerIndex();
    for (let i = 0; i < vs.readers.length; i++) if (vs.readers[i].index === idx) return vs.readers[i];
    return null;
  };

  if (!m.paused) { m.pause(); await sleep(300); m = ir._readAloudManager; }
  const before = await engineFor();
  const fromVoice = before.session.voice;
  const pausedPosition = before.session.position;
  const pausedPlaybackTime = before.session.playbackTime;

  // --- Item 17(f): a voice pick while paused ---
  const target17f = fromVoice === 'local::af_fake' ? 'local::bf_fake' : 'local::af_fake';
  m.selectVoice(target17f);
  const trace = [];
  const t0 = Date.now();
  let readyAt = null;
  while (Date.now() - t0 < 8000) {
    const vs = await voiceSwitchFor();
    const h = vs && vs.handoff;
    trace.push({ ms: Date.now() - t0, stage: h ? h.stage : null, notice: h ? h.notice : null });
    if (h && h.notice === 'ready') { readyAt = { ms: Date.now() - t0, h }; break; }
    await sleep(40);
  }
  const noPrematureReadyOrPreparingSpam = trace.slice(0, Math.max(0, trace.length - 1)).every((t) => t.notice !== 'ready');
  m = ir._readAloudManager;
  m.play();
  await sleep(250);
  const afterPlay = await engineFor();
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  const out17f = {
    step: 'item17f-paused-pick',
    from: fromVoice, to: target17f,
    pausedPosition, pausedPlaybackTime,
    readyObserved: !!readyAt,
    readyAtMs: readyAt ? readyAt.ms : null,
    traceLength: trace.length,
    traceHead: trace.slice(0, 5),
    onlyOneReadyTransition: noPrematureReadyOrPreparingSpam,
    sessionVoiceAfterPlay: afterPlay.session.voice,
    matchesTarget: afterPlay.session.voice === target17f,
    samePosition: afterPlay.session.position === pausedPosition,
    playingAfterPlay: afterPlay.session.playing,
    playbackTimeAfterPlay: afterPlay.session.playbackTime,
    startedNearPausePoint: Math.abs(afterPlay.session.playbackTime - pausedPlaybackTime) < 1.0,
  };

  // --- Item 17(h): a provider pick while paused goes native, Play restarts the sentence ---
  await sleep(300);
  m = ir._readAloudManager;
  if (!m.paused) { m.pause(); await sleep(300); m = ir._readAloudManager; }
  const before17h = await engineFor();
  const beforeHandoffReport = await voiceSwitchFor();
  m.selectTier('fish');
  await sleep(400);
  const afterPick17h = await engineFor();
  const afterPickHandoffReport = await voiceSwitchFor();
  const nativeVoice = m.selectedVoiceID;
  m = ir._readAloudManager;
  m.play();
  await sleep(300);
  const afterPlay17h = await engineFor();
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  const out17h = {
    step: 'item17h-native-paused-pick',
    from: before17h.session.voice,
    nativeVoiceAfterPick: nativeVoice,
    appliedAtOnce: nativeVoice !== before17h.session.voice && afterPick17h.session.voice === nativeVoice,
    noHandoffCreated: (!afterPickHandoffReport || !afterPickHandoffReport.handoff || afterPickHandoffReport.handoff.stage === beforeHandoffReport.handoff.stage),
    positionBeforePlay: afterPick17h.session.position,
    playbackTimeAfterPlay: afterPlay17h.session.playbackTime,
    currentIndexAfterPlay: afterPlay17h.session.currentIndex,
    sentenceRestartedFromZero: afterPlay17h.session.playbackTime < 0.3,
    samePositionAsBeforePick: afterPlay17h.session.currentIndex === before17h.session.position,
    playingAfterPlay: afterPlay17h.session.playing,
  };

  S.item17f = out17f;
  S.item17h = out17h;
  return JSON.stringify({ item17f: out17f, item17h: out17h }, null, 1);
})();
