// Item 17(b) and item 9's stand-in, on the local fake Kokoro-shaped server
// (README "Before you start"): a target WITHOUT word timings. From the real
// Kokoro voice 133-17/133-17b left playing, this points local.baseURL at
// the fake server (mode "no-timings": a decodable clip, no timestamps
// field at all) and picks local::af_fake while playing -- a same-tier pick,
// so no selectTier is needed (driving notes SS3). Expected: no word cut is
// ever armed (inspectWordHandoff's own "no-new-timings" reason,
// core/voice-switch.ts), so the switch commits at the start of a later
// sentence (`last.kind` "sentence"); once af_fake is reading,
// manager.activeTimestamp is the whole-segment stand-in
// {start:0,end:86400,charStart:0,charEnd:<text length>} (item 9).
// params: fakeBaseURL. state: reads fixtures.A; writes item17b, item9.
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
  const waitPlayingIndex = async (index, ceilingMs = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs) { const e = await engineFor(); if (e.session.currentIndex === index && e.session.playing) return e; await sleep(25); }
    return await engineFor();
  };
  const waitHandoff = async (pred, ceilingMs = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs) {
      const vs = await voiceSwitchFor(); const e = await engineFor();
      if (pred(vs, e)) return { vs, e, ms: Date.now() - t0 };
      await sleep(25);
    }
    return { vs: await voiceSwitchFor(), e: await engineFor(), ms: Date.now() - t0, timedOut: true };
  };

  const before = { localBaseURL: Zotero.Prefs.get('zotero-tts.local.baseURL') };
  Zotero.Prefs.set('zotero-tts.local.baseURL', Zotero.ZoteroTTSRun.params.fakeBaseURL);
  // The catalog was loaded from the real server; af_fake/bf_fake only exist
  // once it is reloaded against the new baseURL (2026-09-23: a selectVoice
  // of an id absent from allVoices resolves to the CURRENT voice and is a
  // silent no-op -- the "re-pick of the voice reading" branch of
  // voice-pick.ts, not an error).
  m.loadVoices(true);
  await sleep(1500);
  const mwCatalog = Components.utils.waiveXrays(m).allVoices;
  let fakeVoiceSeen = false;
  for (let i = 0; i < mwCatalog.length; i++) if (Components.utils.waiveXrays(mwCatalog[i]).id === 'local::af_fake') fakeVoiceSeen = true;

  // Get to a known position, playing, before the pick
  m.setSpeed(1);
  m.repositionTo(2);
  await waitPlayingIndex(2, 20000);
  const startedFrom = (await engineFor()).session;
  const positionAtPick = startedFrom.position;

  const beforeStats = (await engineFor()).stats;
  m.selectVoice('local::af_fake');
  const after = await waitHandoff((vs) => vs && vs.handoff && vs.handoff.last && vs.handoff.last.to === 'local::af_fake' && vs.handoff.stage === 'committed', 20000);

  const out17b = {
    step: 'item17b-no-timings-target',
    fakeBaseURL: Zotero.ZoteroTTSRun.params.fakeBaseURL,
    fakeVoiceSeenAfterReload: fakeVoiceSeen,
    from: startedFrom.voice,
    positionAtPick,
    timedOut: !!after.timedOut,
    stage: after.vs && after.vs.handoff ? after.vs.handoff.stage : null,
    wordDecision: after.vs && after.vs.handoff ? after.vs.handoff.wordDecision : null,
    last: after.vs && after.vs.handoff ? after.vs.handoff.last : null,
    lastKindIsSentence: !!(after.vs && after.vs.handoff && after.vs.handoff.last && after.vs.handoff.last.kind === 'sentence'),
    newSentenceIsLater: !!(after.vs && after.vs.handoff && after.vs.handoff.last && after.vs.handoff.last.index > positionAtPick),
    newSentenceOffsetZero: !!(after.vs && after.vs.handoff && after.vs.handoff.last && after.vs.handoff.last.offset === 0),
    sessionVoice: after.e.session.voice,
    matchesTarget: after.e.session.voice === 'local::af_fake',
    carriedOnDelta: after.e.stats.carriedOn - beforeStats.carriedOn,
    playing: after.e.session.playing,
  };

  // --- Item 9's stand-in: the whole-segment timing while a wordless voice reads ---
  await sleep(200);
  const stand = await engineFor();
  const segIndex = stand.session.currentIndex;
  const segText = (() => { try { return ir._readAloudSegments.segments[segIndex].text; } catch (e) { return null; } })();
  const activeTimestamp = Components.utils.waiveXrays(m).activeTimestamp;
  const out9 = {
    step: 'item9-standin',
    segIndex,
    segTextLen: segText ? segText.length : null,
    activeTimestamp: activeTimestamp ? { start: activeTimestamp.start, end: activeTimestamp.end, charStart: activeTimestamp.charStart, charEnd: activeTimestamp.charEnd } : null,
    matchesStandIn: !!(activeTimestamp && activeTimestamp.start === 0 && activeTimestamp.end === 86400 && activeTimestamp.charStart === 0 && segText && activeTimestamp.charEnd === segText.length),
    activeTimestampIndex: stand.session.activeTimestampIndex,
  };

  S.item17b = out17b;
  S.item9 = out9;
  S.localBaseURLBeforeFake = before.localBaseURL;
  return JSON.stringify({ item17b: out17b, item9: out9 }, null, 1);
})();
