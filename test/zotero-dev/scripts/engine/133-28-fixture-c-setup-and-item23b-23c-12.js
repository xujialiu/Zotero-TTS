// Opens fixture C fresh, picks the fake Kokoro voice while genuinely
// playing (loadVoices(true) first, every time -- a catalog not reloaded
// after the fake server's own voice list changed is a silent no-op pick,
// 133-18's first attempt and 133-26's stuck one), then runs item 23(b),
// 23(c) and item 12 on well-separated segments (0/1, 10, 13/14) so the
// Engine's own read-ahead (3 segments deep) never crosses between them.
// params: modeFile, logFile. state: reads fixtures.C (133-27); writes
// item23b, item23c, item12 (replacing all three's predecessors).
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const itemID = S.fixtures.C.itemID;
  const modeFile = Zotero.ZoteroTTSRun.params.modeFile;
  const logFile = Zotero.ZoteroTTSRun.params.logFile;
  const setMode = (mode) => IOUtils.writeUTF8(modeFile, mode);
  const readLog = async () => {
    try {
      const text = await IOUtils.readUTF8(logFile);
      return text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    } catch (e) { return []; }
  };
  const forVoice = (log, voice) => log.filter((l) => l.voice === voice && l.path === '/dev/captioned_speech');

  await setMode('ok');
  await Zotero.Reader.open(itemID);
  let r = null;
  const t0open = Date.now();
  while (Date.now() - t0open < 24000) {
    r = null;
    for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
    if (r && r._internalReader && r._internalReader._readAloudManager) break;
    await sleep(300);
  }
  if (!r) throw new Error('fixture C reader never appeared');
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
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);

  r._iframeWindow.document.notifyUserGestureActivation();
  ir.toggleReadAloudPopup(true);
  let tActive = null;
  const tA0 = Date.now();
  while (Date.now() - tA0 < 30000) { m = ir._readAloudManager; if (m.active) { tActive = Date.now(); break; } await sleep(50); }
  if (!tActive) throw new Error('fixture C manager never activated');
  m.setSpeed(1);
  if (m.paused) m.play();
  const t0p = Date.now();
  while (Date.now() - t0p < 20000) { const e = await engineFor(); if (e.session.playing) break; await sleep(50); }

  // Pick the fake tier's voice while genuinely playing -- reload the
  // catalog first, and verify the target is actually in it before picking
  m.selectTier('kokoro');
  await sleep(200);
  m = ir._readAloudManager;
  m.loadVoices(true);
  await sleep(1500);
  m = ir._readAloudManager;
  const mwCatalog = Components.utils.waiveXrays(m).allVoices;
  let seen = false;
  for (let i = 0; i < mwCatalog.length; i++) if (Components.utils.waiveXrays(mwCatalog[i]).id === 'local::df_fake') seen = true;
  if (!seen) throw new Error('local::df_fake not in the reloaded catalog');
  m.selectVoice('local::df_fake');
  const t1 = Date.now();
  let committed = null;
  while (Date.now() - t1 < 20000) {
    const vs = await voiceSwitchFor();
    if (vs && vs.handoff && vs.handoff.last && vs.handoff.last.to === 'local::df_fake' && vs.handoff.stage === 'committed') { committed = vs; break; }
    await sleep(30);
  }
  if (!committed) throw new Error('never committed to local::df_fake');
  await sleep(200);

  // --- Item 23(c): segment 10, isolated (0/1 for 23(b) are far below; nothing reads ahead into 10 from there) ---
  m = ir._readAloudManager;
  m.setSpeed(1);
  m.repositionTo(10);
  await waitPlayingIndex(10, 20000);
  m.pause();
  await sleep(250);

  await setMode('garbage');
  const logStart23c = (await readLog()).length;
  const debugBefore = await Zotero.Debug.get();
  m = ir._readAloudManager;
  m.repositionTo(10); // re-request the SAME index, now failing -- the earlier "ok" clip must not still be cached (it is: repositionTo replays a cached clip). Use 11 instead, never yet fetched.
  m.repositionTo(11);
  const t2 = Date.now();
  let failedEntry = null;
  while (Date.now() - t2 < 15000) { const e = await engineFor(); if (e.session.error) { failedEntry = e; break; } await sleep(50); }
  await sleep(250);
  const seg11Requests = forVoice((await readLog()).slice(logStart23c), 'df_fake');
  const debugDelta = (await Zotero.Debug.get()).slice(debugBefore.length);
  const forgotMatch = debugDelta.match(/[^\n]*forgot the cached audio of \d+ chars, which would not decode[^\n]*/);

  const logBeforeRetry = (await readLog()).length;
  await setMode('ok');
  await sleep(200);
  m = ir._readAloudManager;
  const controller = Components.utils.waiveXrays(m._controller);
  controller.retry();
  const t3 = Date.now();
  let recovered = null;
  while (Date.now() - t3 < 15000) { const e = await engineFor(); if (e.session.error === null && e.session.playing) { recovered = e; break; } await sleep(50); }
  await sleep(200);
  const seg11RequestsAfterRetry = forVoice((await readLog()).slice(logBeforeRetry), 'df_fake');

  const out23c = {
    step: 'item23c-fixtureC',
    seg11FirstRequestFreshUnderGarbage: seg11Requests.length > 0 && seg11Requests[0].mode === 'garbage',
    seg11Requests: seg11Requests.map((x) => ({ mode: x.mode, outcome: x.outcome })),
    decodeFailureSeen: !!failedEntry,
    error: failedEntry ? failedEntry.session.error : null,
    isUnknown: !!failedEntry && failedEntry.session.error === 'unknown',
    forgotLineSeen: !!forgotMatch,
    forgotLineText: forgotMatch ? forgotMatch[0] : null,
    retryRecovered: !!recovered,
    retryPlaying: recovered ? recovered.session.playing : null,
    retryCurrentIndex: recovered ? recovered.session.currentIndex : null,
    retryReachedServerAgain: seg11RequestsAfterRetry.length > 0,
    seg11RequestsAfterRetry: seg11RequestsAfterRetry.map((x) => ({ mode: x.mode, outcome: x.outcome })),
  };
  m = ir._readAloudManager;
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  // --- Item 23(b): segment 0 played from a stop, segment 1 is its untouched read-ahead target ---
  await setMode('ok');
  m = ir._readAloudManager;
  m.setSpeed(1);
  m.repositionTo(0);
  await waitPlayingIndex(0, 20000);
  await setMode('fail-once'); // right away -- segment 1's read-ahead fires moments after 0 starts
  const logStart23b = (await readLog()).length;
  const errorSamples = [];
  const t4 = Date.now();
  let reached1 = null;
  while (Date.now() - t4 < 20000) {
    const e = await engineFor();
    errorSamples.push({ ms: Date.now() - t4, error: e.session.error, currentIndex: e.session.currentIndex, playing: e.session.playing });
    if (e.session.currentIndex === 1 && e.session.playing) { reached1 = e; break; }
    await sleep(60);
  }
  await sleep(300);
  await setMode('ok');
  const seg1Attempts = forVoice((await readLog()).slice(logStart23b), 'df_fake');
  m = ir._readAloudManager;
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  const out23b = {
    step: 'item23b-fixtureC',
    seg1FirstRequestWasFailOnce: seg1Attempts.length > 0 && seg1Attempts[0].mode === 'fail-once',
    seg1Attempts: seg1Attempts.map((x) => ({ mode: x.mode, outcome: x.outcome, attempt: x.attempt })),
    failedOnceThenSucceeded: seg1Attempts.some((a) => a.outcome === '500-first-attempt') && seg1Attempts.some((a) => a.outcome === '200-ok'),
    reachedSegment1: !!reached1,
    errorEverSeenNonNull: errorSamples.some((s) => s.error !== null),
    readingWentOnWithoutError: !!reached1 && !errorSamples.some((s) => s.error !== null),
    sampleCount: errorSamples.length,
  };

  // --- Item 12: buffering and "Preparing..." with a slow server, on a skip ---
  await setMode('ok');
  m = ir._readAloudManager;
  m.setSpeed(1);
  m.repositionTo(13);
  await waitPlayingIndex(13, 20000);
  await setMode('slow'); // 1-2s per answer
  const notice0 = await engineFor();
  const toastBefore = (() => { try { return r._iframeWindow.document.getElementById('ztts-playback-notice'); } catch (e) { return null; } })();
  const mw = Components.utils.waiveXrays(m);
  const tSkip = Date.now();
  mw.skipAhead('sentence', false); // -> segment 14, never fetched, "slow" mode
  const bufferSamples = [];
  let playedTargetAt = null;
  while (Date.now() - tSkip < 8000) {
    const e = await engineFor();
    let toastText = null, toastOpacity = null;
    try { const el = r._iframeWindow.document.getElementById('ztts-playback-notice'); if (el) { toastText = el.textContent; toastOpacity = el.style.opacity; } } catch (err) {}
    bufferSamples.push({ ms: Date.now() - tSkip, buffering: e.session.buffering, currentIndex: e.session.currentIndex, playing: e.session.playing, notices: e.session.notices, toastText, toastOpacity });
    if (e.session.currentIndex === 14 && e.session.playing && !playedTargetAt) playedTargetAt = Date.now() - tSkip;
    if (playedTargetAt && Date.now() - tSkip > playedTargetAt + 400) break;
    await sleep(40);
  }
  await setMode('ok');
  m = ir._readAloudManager;
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  const noticeEnd = await engineFor();

  const preparingShownSample = bufferSamples.find((s) => s.toastText && /preparing/i.test(s.toastText));
  const out12 = {
    step: 'item12-slow-preparing-fixtureC',
    playedTargetAtMs: playedTargetAt,
    bufferingSeenTrue: bufferSamples.some((s) => s.buffering === true),
    preparingToastSeen: !!preparingShownSample,
    preparingFirstSeenAtMs: preparingShownSample ? preparingShownSample.ms : null,
    noticesShownDelta: noticeEnd.session.notices.shown - notice0.session.notices.shown,
    noticesStartsDelta: noticeEnd.session.notices.starts - notice0.session.notices.starts,
    noticesWaitsDelta: noticeEnd.session.notices.waits - notice0.session.notices.waits,
    sampleCount: bufferSamples.length,
    samplesHead: bufferSamples.slice(0, 5),
    samplesAroundPlay: playedTargetAt ? bufferSamples.filter((s) => Math.abs(s.ms - playedTargetAt) < 200) : [],
  };

  S.item23c = out23c;
  S.item23b = out23b;
  S.item12 = out12;
  return JSON.stringify({ item23b: out23b, item23c: out23c, item12: out12 }, null, 1);
})();
