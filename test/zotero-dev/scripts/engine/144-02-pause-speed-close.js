// Issue #144 live cancellation checks: pause while the adaptive word-clock
// retry is pending, resume at a changed speed, make a mid-sentence speed cut,
// start a new source, and close the Player.  The script keeps the host
// minimized because it uses the manager directly and does not claim frame
// evidence.  The deterministic quantized-clock and late-callback cases live
// in test/core/engine/session.test.ts.
// params: none. state: reads fixtures.A; writes item144PauseSpeedClose.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = async (test, ceiling = 15000, step = 20) => {
    const end = Date.now() + ceiling;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return await test();
  };
  const out = { step: 'item144-pause-speed-close' };
  const itemID = S.fixtures?.A?.itemID;
  if (!itemID) throw new Error('fixture A is missing');
  const readerOf = () => {
    const readers = Zotero.Reader?._readers || [];
    for (let i = 0; i < readers.length; i++) if (readers[i]?.itemID === itemID) return readers[i];
    return null;
  };
  const reader = readerOf();
  if (!reader) throw new Error('fixture A reader is missing');
  const ir = reader._internalReader;
  let manager = ir?._readAloudManager;
  if (!manager?.active) {
    try { ir.toggleReadAloudPopup(true); } catch (e) { throw new Error('fixture A Player could not reopen: ' + String(e)); }
    manager = await wait(() => ir._readAloudManager?.active ? ir._readAloudManager : null, 20000, 40);
  }
  if (!manager?.active) throw new Error('fixture A manager is not active');
  const host = Zotero.getMainWindow?.();
  try { host?.minimize?.(); } catch (e) {}
  const diag = async () => {
    const all = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < all.readers.length; i++) if (all.readers[i].itemID === itemID) return all.readers[i];
    return null;
  };
  const notify = () => { try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) {} };
  const ensurePaused = async () => {
    manager = ir._readAloudManager;
    if (manager?.active && !manager.paused) {
      try { manager.pause(); } catch (e) {}
      await wait(() => ir._readAloudManager?.paused === true, 4000, 20);
    }
    manager = ir._readAloudManager;
  };
  const playAt = async (index, speed) => {
    await ensurePaused();
    manager.setSpeed(speed);
    manager.repositionTo(index);
    notify();
    try { manager.play(); } catch (e) {}
    const playing = await wait(async () => {
      const value = await diag();
      return value?.session?.currentIndex === index && value.session.playing ? value : null;
    }, 20000, 30);
    return playing || await diag();
  };
  const target = 4;
  const newSource = 5;

  // A short retry is visible as the last scheduled wait below the old 15 ms
  // floor. Pause immediately after observing it, then prove both the word and
  // tick counters stay fixed while the timer should have been pending.
  const started = await playAt(target, 3);
  out.started = started ? {
    index: started.session.currentIndex,
    playing: started.session.playing,
    speed: started.session.speed,
    audio: started.audio,
  } : null;
  let pending = null;
  const pendingEnd = Date.now() + 5000;
  while (Date.now() < pendingEnd) {
    const value = await diag();
    if (value?.session?.playing && Number(value.session.wordClock?.lastWaitMs) > 0 && Number(value.session.wordClock.lastWaitMs) < 15) {
      pending = value;
      break;
    }
    await sleep(8);
  }
  out.shortRetryObserved = pending ? {
    ticks: pending.session.wordClock.ticks,
    activeTimestampIndex: pending.session.activeTimestampIndex,
    lastWaitMs: pending.session.wordClock.lastWaitMs,
    speed: pending.session.speed,
  } : null;
  if (pending) {
    try { manager.pause(); } catch (e) {}
    const pauseTicks = pending.session.wordClock.ticks;
    const pauseWord = pending.session.activeTimestampIndex;
    await sleep(180);
    const afterPause = await diag();
    out.pauseCancelsRetry = {
      paused: afterPause?.session?.paused ?? null,
      ticksBefore: pauseTicks,
      ticksAfter: afterPause?.session?.wordClock?.ticks ?? null,
      wordBefore: pauseWord,
      wordAfter: afterPause?.session?.activeTimestampIndex ?? null,
      ticksStable: afterPause?.session?.wordClock?.ticks === pauseTicks,
      wordStable: afterPause?.session?.activeTimestampIndex === pauseWord,
    };
    // Resume the same source after a speed change. A cancelled timer must not
    // move the old word after the new source starts.
    manager.setSpeed(2.5);
    const speedWhilePaused = await diag();
    notify();
    manager.play();
    await sleep(180);
    const afterResume = await diag();
    out.resumeChangedSpeed = {
      speedWhilePaused: speedWhilePaused?.session?.speed ?? null,
      speedAfterResume: afterResume?.session?.speed ?? null,
      ticksWhilePaused: speedWhilePaused?.session?.wordClock?.ticks ?? null,
      ticksAfterResume: afterResume?.session?.wordClock?.ticks ?? null,
      currentIndex: afterResume?.session?.currentIndex ?? null,
      wordAfterResume: afterResume?.session?.activeTimestampIndex ?? null,
      oldTimerDidNotAdvanceWhilePaused: speedWhilePaused?.session?.wordClock?.ticks === pauseTicks,
      resumedAtNewSpeed: afterResume?.session?.speed === 2.5 && afterResume?.session?.playing === true,
    };
  } else {
    out.pauseCancelsRetry = { notTestable: 'no live short retry observed within 5 s' };
    out.resumeChangedSpeed = { notTestable: 'no live short retry to pause' };
  }

  // A playing speed change is a hard cut: the same sentence and a continuous
  // audio position are retained.
  const beforeCut = await playAt(target, 1);
  await sleep(240);
  const cutBefore = await diag();
  manager = ir._readAloudManager;
  manager.setSpeed(2.5);
  const cutAfter = await diag();
  out.midSentenceSpeedCut = {
    before: cutBefore ? { index: cutBefore.session.currentIndex, time: cutBefore.session.playbackTime, speed: cutBefore.session.speed } : null,
    after: cutAfter ? { index: cutAfter.session.currentIndex, time: cutAfter.session.playbackTime, speed: cutAfter.session.speed } : null,
    sameSentence: cutBefore?.session?.currentIndex === cutAfter?.session?.currentIndex,
    playbackNotRestarted: Number(cutAfter?.session?.playbackTime) >= Number(cutBefore?.session?.playbackTime) - 0.05,
    speedApplied: cutAfter?.session?.speed === 2.5,
    started: !!beforeCut,
  };

  // A new source starts with a fresh retry schedule at the selected speed.
  await ensurePaused();
  manager.setSpeed(3);
  manager.repositionTo(newSource);
  notify();
  manager.play();
  const newPlaying = await wait(async () => {
    const value = await diag();
    return value?.session?.currentIndex === newSource && value.session.playing ? value : null;
  }, 20000, 30);
  out.newSource = newPlaying ? {
    currentIndex: newPlaying.session.currentIndex,
    speed: newPlaying.session.speed,
    playing: newPlaying.session.playing,
    wordClock: newPlaying.session.wordClock,
  } : null;
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }

  // Close the Player while the source is playing. The listener is attached to
  // the current controller and the counts are read after the close settles.
  const closeStarted = await playAt(target, 3);
  manager = ir._readAloudManager;
  const closeController = Components.utils.waiveXrays(manager?._controller);
  const closeEvents = [];
  const closeStart = Date.now();
  let closeListener = null;
  if (closeController && typeof closeController.addEventListener === 'function') {
    closeListener = Components.utils.exportFunction(function () {
      closeEvents.push({ at: Date.now() - closeStart, index: closeController.activeTimestampIndex });
    }, reader._iframeWindow, { allowCrossOriginArguments: true });
    closeController.addEventListener('ActiveWordChange', closeListener);
  }
  await sleep(120);
  const beforeClose = await diag();
  const ticksAtClose = beforeClose?.session?.wordClock?.ticks ?? null;
  const eventsAtClose = closeEvents.length;
  try { ir.toggleReadAloudPopup(false); } catch (e) { out.closeError = String(e); }
  await wait(() => ir._readAloudManager?.active === false, 5000, 30);
  await sleep(350);
  const afterClose = await diag();
  try { closeController?.removeEventListener?.('ActiveWordChange', closeListener); } catch (e) {}
  out.closePlayer = {
    started: !!closeStarted,
    before: beforeClose ? { active: true, paused: beforeClose.session.paused, ticks: ticksAtClose, audio: beforeClose.audio } : null,
    after: afterClose ? { active: !!ir._readAloudManager?.active, paused: afterClose.session.paused, ended: afterClose.session.ended, ticks: afterClose.session.wordClock?.ticks, audio: afterClose.audio, controller: afterClose.controller } : null,
    eventsBeforeClose: eventsAtClose,
    eventsAfterClose: closeEvents.length,
    ticksStableAfterClose: afterClose?.session?.wordClock?.ticks === ticksAtClose,
    noWordCallbacksAfterClose: closeEvents.length === eventsAtClose,
    audioClosed: afterClose?.audio?.state === 'none',
    audioContextsStable: afterClose?.audio?.contexts === beforeClose?.audio?.contexts,
  };
  try { host?.minimize?.(); } catch (e) {}
  out.windowStateAfter = host?.windowState ?? null;
  S.item144PauseSpeedClose = out;
  return JSON.stringify(out, null, 1);
})();
