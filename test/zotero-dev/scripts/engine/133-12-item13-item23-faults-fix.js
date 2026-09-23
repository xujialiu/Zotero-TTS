// Item 13 / item 23(c), corrected. REVISED (2026-09-23): the first attempt
// (133-11) toggled the fake server between modes while it kept accepting the
// TCP connection; "down" mode then closed the socket without answering,
// which Gecko does not treat as an instant failure the way a refused port
// does -- the 10 s poll ceiling gave up before the fetch itself did, so
// errorHighlight.error read null and the retry checks read stale state. This
// version points local.baseURL at a port nothing listens on for "network",
// which fails fast and definitely, and re-checks decode-failure Retry in
// isolation with a longer settle before reading state.
// params: workingURL, downURL (an unreachable port), modeFile (garbage/ok).
// state: reads fixtures.A (already on local::af_fake); writes item13, item23c.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out13 = { step: 'item13-errors-fixed' };
  const out23c = { step: 'item23c-decode-fixed' };
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found');
  const ir = r._internalReader;
  let m = ir._readAloudManager;
  if (m.selectedVoiceID !== 'local::af_fake') throw new Error('fixture A is not on the fake voice');

  const PREFIX = 'zotero-tts.';
  const setBaseURL = (u) => Zotero.Prefs.set(PREFIX + 'local.baseURL', u);
  const modeFile = Zotero.ZoteroTTSRun.params.modeFile;
  const setMode = async (mode) => IOUtils.writeUTF8(modeFile, mode);
  const workingURL = Zotero.ZoteroTTSRun.params.workingURL;
  const downURL = Zotero.ZoteroTTSRun.params.downURL;

  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };
  const waitFor = async (pred, ceilingMs) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs) { const e = await engineFor(); if (pred(e)) return { e, ms: Date.now() - t0 }; await sleep(50); }
    return { e: await engineFor(), ms: Date.now() - t0, timedOut: true };
  };

  await setMode('ok');
  setBaseURL(workingURL);
  m.setSpeed(1);
  m.repositionTo(16); // the one segment this fake voice has not yet been asked for
  const started = await waitFor((e) => e.session.currentIndex === 16 && e.session.playing, 15000);
  out13.reachedFreshSegment = !started.timedOut;
  if (m.active && !m.paused) { try { m.pause(); } catch (e2) {} }

  // A failed request: point at a closed port -- fails fast and for certain
  setBaseURL(downURL);
  m.repositionTo(9); // a fresh index this voice has not spoken (reused after the earlier attempt's activity)
  const failed = await waitFor((e) => !!e.session.error, 15000);
  out13.errorHighlight = {
    timedOut: !!failed.timedOut, error: failed.e.session.error, position: failed.e.session.position,
    currentIndex: failed.e.session.currentIndex, managerPaused: m.paused, managerActiveSegmentPresent: !!m.activeSegment,
  };
  out13.errorIsNetwork = failed.e.session.error === 'network';
  const requestsAtFailure = failed.e.session.store ? failed.e.session.store.requests : null;

  // Play fails again at once, without a request (still down)
  m.play();
  await sleep(400);
  const afterPlayRetryless = await engineFor();
  out13.playAgainNoRequest = {
    error: afterPlayRetryless.session.error,
    requestsDelta: requestsAtFailure === null ? null : (afterPlayRetryless.session.store ? afterPlayRetryless.session.store.requests : null) - requestsAtFailure,
    stillPaused: m.paused,
  };

  // Retry asks again -- the server is reachable once more
  setBaseURL(workingURL);
  const controller = Components.utils.waiveXrays(m._controller);
  controller.retry();
  const recovered = await waitFor((e) => e.session.error === null && e.session.playing, 15000);
  out13.retryRecovered = { timedOut: !!recovered.timedOut, error: recovered.e.session.error, playing: recovered.e.session.playing, currentIndex: recovered.e.session.currentIndex };
  if (m.active && !m.paused) { try { m.pause(); } catch (e2) {} }

  // --- Item 23(c), re-checked: decode failure then a working Retry ---
  await setMode('ok');
  m.repositionTo(10);
  const okFirst = await waitFor((e) => e.session.currentIndex === 10 && e.session.playing, 15000);
  out23c.reachedOk = !okFirst.timedOut;
  if (m.active && !m.paused) { try { m.pause(); } catch (e2) {} }
  await setMode('garbage');
  m.repositionTo(14); // never asked of this fake server
  const decodeFailed = await waitFor((e) => !!e.session.error, 15000);
  out23c.decodeFailure = { timedOut: !!decodeFailed.timedOut, error: decodeFailed.e.session.error, isUnknown: decodeFailed.e.session.error === 'unknown', position: decodeFailed.e.session.position };
  await setMode('ok');
  await sleep(300); // let the mode file write settle before asking again
  const controller2 = Components.utils.waiveXrays(ir._readAloudManager._controller);
  controller2.retry();
  const decodeRecovered = await waitFor((e) => e.session.error === null && e.session.playing, 15000);
  out23c.decodeRetryWorks = { timedOut: !!decodeRecovered.timedOut, error: decodeRecovered.e.session.error, playing: decodeRecovered.e.session.playing, currentIndex: decodeRecovered.e.session.currentIndex };
  m = ir._readAloudManager;
  if (m.active && !m.paused) { try { m.pause(); } catch (e2) {} }

  S.item13 = out13;
  S.item23c = out23c;
  return JSON.stringify({ item13: out13, item23c: out23c }, null, 1);
})();
