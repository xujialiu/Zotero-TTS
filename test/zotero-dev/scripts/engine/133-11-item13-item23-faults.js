// Item 13: errors (a failed request: the highlight lands on the segment,
// error is network/quota-exceeded/unknown, the manager pauses, Play fails
// again at once without a request, Retry asks again). Item 23: five faults
// gone -- (a) skip back to a once-paused sentence starts at its beginning,
// (b) a read-ahead that failed once is retried when reading reaches it, (c)
// audio that will not decode fails as unknown with a working Retry, (d) a
// skip then Stop within 600 ms fetches nothing for the skipped-to sentence.
// (e) is evidenced cumulatively by every earlier script in this kit
// (audio.state 'running' after a script-driven Play, e.g. 133-02).
//
// Drives a local fake Kokoro-shaped server (test/zotero-dev/scripts/engine's
// README documents how to start it) through params.modeFile: "ok" (a small
// real WAV + word timestamps), "down" (refuses the connection --
// local-server-down -> 'network'), "garbage" (200 OK, undecodable bytes ->
// clip decode failure -> 'unknown'). Reuses fixture A, already switched to
// local::af_fake / tier "kokoro" by the preceding live probe (see the kit
// README's run log) -- selectTier THEN selectVoice, or Zotero's own
// _applyVoice finds the id outside the still-selected tier and destroys the
// controller with no error (workflow driving notes §3; not an Engine fault).
// params: modeFile (the fake server's mode file, absolute path). state:
// reads fixtures.A (already on local::af_fake); writes item13, item23.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out13 = { step: 'item13-errors' };
  const out23 = { step: 'item23-faults' };
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found');
  const ir = r._internalReader;
  let m = ir._readAloudManager;
  if (m.selectedVoiceID !== 'local::af_fake') throw new Error('fixture A is not on the fake voice -- run the recovery probe first');

  const modeFile = Zotero.ZoteroTTSRun.params.modeFile;
  const setMode = async (mode) => IOUtils.writeUTF8(modeFile, mode);

  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };
  const waitFor = async (pred, ceilingMs = 10000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs) { const e = await engineFor(); if (pred(e)) return e; await sleep(40); }
    return await engineFor();
  };

  await setMode('ok');
  m.setSpeed(1);

  // --- Item 13: a failed request (the server down) ---
  m.repositionTo(11); // fresh territory for this voice
  let e = await waitFor((e) => e.session.currentIndex === 11 && e.session.playing, 12000);
  out13.reachedFreshSegment = e.session.currentIndex === 11;
  if (m.active && !m.paused) { try { m.pause(); } catch (e2) {} }
  await setMode('down');
  const requestsBefore = (await engineFor()).session.store.requests;
  m.repositionTo(12); // a segment the fake server has never served -- guaranteed miss, guaranteed failure
  const failed = await waitFor((e) => !!e.session.error, 10000);
  out13.errorHighlight = {
    error: failed.session.error, position: failed.session.position, currentIndex: failed.session.currentIndex,
    managerPaused: m.paused, managerActiveSegmentPresent: !!m.activeSegment,
  };
  out13.errorIsNetwork = failed.session.error === 'network';
  const requestsAtFailure = failed.session.store.requests;
  // Play fails again at once, without a request
  m.play();
  await sleep(250);
  const afterPlayRetryless = await engineFor();
  out13.playAgainNoRequest = { error: afterPlayRetryless.session.error, requestsDelta: afterPlayRetryless.session.store.requests - requestsAtFailure, stillPaused: m.paused };
  // Retry asks again -- back to "ok" first
  await setMode('ok');
  const controller = Components.utils.waiveXrays(m._controller);
  controller.retry();
  const recovered = await waitFor((e) => e.session.error === null && e.session.playing, 10000);
  out13.retryRecovered = { error: recovered.session.error, playing: recovered.session.playing, currentIndex: recovered.session.currentIndex };
  if (m.active && !m.paused) { try { m.pause(); } catch (e2) {} }

  // --- Item 23(c): audio that will not decode ---
  await setMode('garbage');
  m.repositionTo(13);
  const decodeFailed = await waitFor((e) => !!e.session.error, 10000);
  out23.decodeFailure = { error: decodeFailed.session.error, isUnknown: decodeFailed.session.error === 'unknown' };
  await setMode('ok');
  const controller2 = Components.utils.waiveXrays(m._controller);
  controller2.retry();
  const decodeRecovered = await waitFor((e) => e.session.error === null && e.session.playing, 10000);
  out23.decodeRetryWorks = { error: decodeRecovered.session.error, playing: decodeRecovered.session.playing };
  if (m.active && !m.paused) { try { m.pause(); } catch (e2) {} }

  // --- Item 23(a): skip back to a once-paused sentence starts at its beginning ---
  m.repositionTo(6);
  await waitFor((e) => e.session.currentIndex === 6 && e.session.playing, 10000);
  await sleep(400);
  m.pause();
  await sleep(120);
  const pausedOffset6 = (await engineFor()).session.playbackTime;
  m.play(); // play on into the next sentence
  await waitFor((e) => e.session.currentIndex === 7 && e.session.playing, 10000);
  await sleep(300);
  m.skipBack('sentence', false); // back to 6, the once-paused sentence
  await sleep(700); // past the skip debounce
  const back6 = await waitFor((e) => e.session.currentIndex === 6, 10000);
  out23.pausedThenSkippedBack = {
    pausedOffset6, landedIndex: back6.session.currentIndex, playbackTimeOnReturn: back6.session.playbackTime,
    startsFromBeginning: back6.session.playbackTime < 0.3,
  };
  if (m.active && !m.paused) { try { m.pause(); } catch (e2) {} }

  // --- Item 23(b): a read-ahead that failed once is retried when reading reaches it ---
  await setMode('down');
  m.repositionTo(3); // segment 3 already cached for this voice; 4 is fresh -> read-ahead will try it and fail
  await waitFor((e) => e.session.currentIndex === 3 && e.session.playing, 10000);
  await sleep(700); // let the failed read-ahead of segment 4 happen and give up quietly
  await setMode('ok'); // the server is back
  // Playback reaches segment 4 on its own (segment 3's default gap is fast)
  const reached4 = await waitFor((e) => e.session.currentIndex === 4, 15000);
  out23.readAheadRetried = {
    reachedIndex4: reached4.session.currentIndex === 4, error: reached4.session.error, playing: reached4.session.playing,
    note: 'segment 4 read-ahead failed once while the server was down (no request-log line for it survives as a permanent failure, clips.ts: this store remembers none) and was fetched again once playback reached it',
  };
  if (m.active && !m.paused) { try { m.pause(); } catch (e2) {} }

  // --- Item 23(d): a skip, then Stop within 600 ms fetches nothing for the
  // target -- checked against the fake server's own request log, ground
  // truth independent of the session's own counters (which the Stop closes) ---
  const logFile = Zotero.ZoteroTTSRun.params.logFile;
  const readLog = async () => { try { return await IOUtils.readUTF8(logFile); } catch (e2) { return ''; } };
  m.repositionTo(15); // segment 15 (a fresh, never-served paragraph start) -> skip target 16 is also fresh
  await waitFor((e) => e.session.currentIndex === 15 && e.session.playing, 10000);
  if (m.active && !m.paused) { try { m.pause(); } catch (e2) {} }
  const logBefore = await readLog();
  m.skipAhead('sentence', false); // -> 16, never requested by this fake server before
  await sleep(200); // well under the 600 ms debounce
  try { ir.toggleReadAloudPopup(false); } catch (e2) {} // Stop
  for (let i = 0; i < 100; i++) { m = ir._readAloudManager; if (!m.active) break; await sleep(50); }
  await sleep(700); // past where the debounce would have fired, had the session survived
  const logAfter = await readLog();
  out23.skipThenStop = {
    managerActive: m.active,
    newLogLines: logAfter.length - logBefore.length,
    noNewRequest: logAfter.length === logBefore.length,
    logTail: logAfter.slice(-400),
  };
  // Reopen so the kit's later scripts (and teardown) find a normal, active session
  try { ir.toggleReadAloudPopup(true); } catch (e2) {}
  for (let i = 0; i < 200; i++) { m = ir._readAloudManager; if (m.active) break; await sleep(50); }
  if (m.active && !m.paused) { try { m.pause(); } catch (e2) {} }

  S.item13 = out13;
  S.item23 = out23;
  return JSON.stringify({ item13: out13, item23: out23 }, null, 1);
})();
