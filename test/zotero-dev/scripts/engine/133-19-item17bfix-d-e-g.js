// Item 17(b) (corrected: mode must be switched on the fake server itself,
// not just the baseURL -- 133-18b left af_fake reading WITH timings because
// the mode file was still "ok"), item 9's stand-in on that no-timings
// voice, 17(d) (two picks within 120ms collapse to the last), 17(e)'s
// skip/speed change/jump thirds (each cancels a pending switch; Stop is
// 133-2x on fixture B, since it closes the player), and 17(g) (a target
// whose request fails).
// params: modeFile, logFile. state: reads fixtures.A (already on
// local::af_fake per 133-18b); writes item17b, item9, item17d, item17e,
// item17g.
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
  const logFile = Zotero.ZoteroTTSRun.params.logFile;
  const setMode = (mode) => IOUtils.writeUTF8(modeFile, mode);
  const readLogTail = async (sinceEpochS) => {
    try {
      const text = await IOUtils.readUTF8(logFile);
      return text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } })
        .filter((e) => e && e.t >= sinceEpochS);
    } catch (e) { return []; }
  };

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
  const waitHandoffTo = async (target, pred, ceilingMs = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs) {
      const vs = await voiceSwitchFor(); const e = await engineFor();
      if (vs && vs.handoff && vs.handoff.last && vs.handoff.last.to === target && pred(vs, e)) return { vs, e, ms: Date.now() - t0 };
      await sleep(25);
    }
    return { vs: await voiceSwitchFor(), e: await engineFor(), ms: Date.now() - t0, timedOut: true };
  };

  await setMode('ok');
  m.setSpeed(1);
  m.repositionTo(3);
  await waitPlayingIndex(3, 20000);
  await sleep(300);
  const currentVoice0 = (await engineFor()).session.voice;

  // --- Item 17(b), corrected: the target genuinely has no timings ---
  await setMode('no-timings');
  const target17b = currentVoice0 === 'local::af_fake' ? 'local::bf_fake' : 'local::af_fake';
  const beforeB = await engineFor();
  m.selectVoice(target17b);
  const afterB = await waitHandoffTo(target17b, (vs) => vs.handoff.stage === 'committed', 20000);
  const out17b = {
    step: 'item17b-no-timings-target-fixed',
    from: currentVoice0, to: target17b,
    timedOut: !!afterB.timedOut,
    wordDecision: afterB.vs && afterB.vs.handoff ? afterB.vs.handoff.wordDecision : null,
    last: afterB.vs && afterB.vs.handoff ? afterB.vs.handoff.last : null,
    lastKindIsSentence: !!(afterB.vs && afterB.vs.handoff && afterB.vs.handoff.last && afterB.vs.handoff.last.kind === 'sentence'),
    newSentenceOffsetZero: !!(afterB.vs && afterB.vs.handoff && afterB.vs.handoff.last && afterB.vs.handoff.last.offset === 0),
    newSentenceIsLaterOrSame: !!(afterB.vs && afterB.vs.handoff && afterB.vs.handoff.last && afterB.vs.handoff.last.index >= beforeB.session.position),
    sessionVoice: afterB.e.session.voice,
    matchesTarget: afterB.e.session.voice === target17b,
    carriedOnDelta: afterB.e.stats.carriedOn - beforeB.stats.carriedOn,
    playing: afterB.e.session.playing,
  };

  // --- Item 9's stand-in, on this same no-timings voice ---
  await sleep(200);
  const stand = await engineFor();
  const segIndexStand = stand.session.currentIndex;
  const segTextStand = (() => { try { return ir._readAloudSegments.segments[segIndexStand].text; } catch (e) { return null; } })();
  const activeTimestamp = Components.utils.waiveXrays(m).activeTimestamp;
  const out9 = {
    step: 'item9-standin-fixed',
    segIndex: segIndexStand,
    segTextLen: segTextStand ? segTextStand.length : null,
    activeTimestamp: activeTimestamp ? { start: activeTimestamp.start, end: activeTimestamp.end, charStart: activeTimestamp.charStart, charEnd: activeTimestamp.charEnd } : null,
    matchesStandIn: !!(activeTimestamp && activeTimestamp.start === 0 && activeTimestamp.end === 86400 && activeTimestamp.charStart === 0 && segTextStand && activeTimestamp.charEnd === segTextStand.length),
    activeTimestampIndex: stand.session.activeTimestampIndex,
  };

  // --- Item 17(d): two (really three) picks within 120ms collapse to the last ---
  await setMode('ok');
  await sleep(300);
  const before17d = await engineFor();
  const startVoice17d = before17d.session.voice; // e.g. local::bf_fake
  const other17d = startVoice17d === 'local::af_fake' ? 'local::bf_fake' : 'local::af_fake';
  const tWindowStart = Date.now() / 1000;
  const t0 = Date.now();
  m.selectVoice(other17d);        // pick 1: the other voice
  m.selectVoice(startVoice17d);   // pick 2, <120ms later: back to the current one
  m.selectVoice(other17d);        // pick 3, still <120ms: the other voice again -- this one should win
  const msBetweenPicks = Date.now() - t0;
  const after17d = await waitHandoffTo(other17d, (vs) => vs.handoff.stage === 'committed', 20000);
  await sleep(150);
  const logDuring17d = await readLogTail(tWindowStart);
  const voicesRequestedDuring17d = Array.from(new Set(logDuring17d.filter((e) => e.path === '/dev/captioned_speech').map((e) => e.voice)));
  const out17d = {
    step: 'item17d-coalesce-120ms',
    startVoice: startVoice17d, picks: [other17d, startVoice17d, other17d], msBetweenPicks,
    timedOut: !!after17d.timedOut,
    finalVoice: after17d.e.session.voice,
    onlyLastRequested: voicesRequestedDuring17d.length <= 1 && (voicesRequestedDuring17d.length === 0 || voicesRequestedDuring17d[0] === other17d.replace('local::', '')),
    voicesRequestedDuring: voicesRequestedDuring17d,
    carriedOnDelta: after17d.e.stats.carriedOn - before17d.stats.carriedOn,
  };

  // --- Item 17(e), thirds: skip / speed change / jump each cancel a pending switch ---
  const cancelCase = async (name, act) => {
    await setMode('slow'); // keeps the target's fetch pending long enough to act on
    const before = await engineFor();
    const from = before.session.voice;
    const to = from === 'local::af_fake' ? 'local::bf_fake' : 'local::af_fake';
    m.selectVoice(to);
    await sleep(300); // still preparing -- "slow" answers after 1.5s
    const preparing = await voiceSwitchFor();
    act();
    await sleep(250);
    const after = await voiceSwitchFor();
    const engineAfter = await engineFor();
    await setMode('ok');
    return {
      name, from, to,
      wasPreparing: !!(preparing && preparing.handoff && preparing.handoff.pending === to && preparing.handoff.stage !== 'committed'),
      stageAfter: after && after.handoff ? after.handoff.stage : null,
      cancelled: !!(after && after.handoff && after.handoff.stage === 'cancelled'),
      voiceUnchanged: engineAfter.session.voice === from,
      playingAfter: engineAfter.session.playing,
    };
  };
  const skipCase = await cancelCase('skip', () => m.skipAhead('sentence', false));
  await sleep(700); // past the skip debounce before the next sub-case
  const speedCase = await cancelCase('speedChange', () => m.setSpeed(1.4));
  m.setSpeed(1);
  const jumpCase = await cancelCase('jump-repositionTo', () => m.repositionTo(4));
  await waitPlayingIndex(4, 20000).catch(() => {});
  const out17e = { step: 'item17e-cancel-thirds', skipCase, speedCase, jumpCase, allCancelled: skipCase.cancelled && speedCase.cancelled && jumpCase.cancelled, allVoiceUnchanged: skipCase.voiceUnchanged && speedCase.voiceUnchanged && jumpCase.voiceUnchanged };

  // --- Item 17(g): a target whose request fails ---
  await setMode('error');
  const before17g = await engineFor();
  const from17g = before17g.session.voice;
  const to17g = from17g === 'local::af_fake' ? 'local::bf_fake' : 'local::af_fake';
  m.selectVoice(to17g);
  const t0g = Date.now();
  let failedAt = null;
  while (Date.now() - t0g < 20000) {
    const vs = await voiceSwitchFor();
    if (vs && vs.handoff && vs.handoff.pending === to17g && vs.handoff.stage === 'failed') { failedAt = vs; break; }
    await sleep(25);
  }
  await setMode('ok');
  const after17g = await engineFor();
  const out17g = {
    step: 'item17g-target-request-fails',
    from: from17g, to: to17g,
    failed: !!failedAt,
    notice: failedAt ? failedAt.handoff.notice : null,
    sessionVoiceUnchanged: after17g.session.voice === from17g,
    oldVoiceStillPlaying: after17g.session.playing,
  };

  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  S.item17b = out17b;
  S.item9 = out9;
  S.item17d = out17d;
  S.item17e = out17e;
  S.item17g = out17g;
  return JSON.stringify({ item17b: out17b, item9: out9, item17d: out17d, item17e: out17e, item17g: out17g }, null, 1);
})();
