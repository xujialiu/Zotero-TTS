// Item 18: one reading across tabs (starting in another tab pauses this
// one) and the stop key (closes every player, keeps each place, shows its
// toast; each closed player's session ended true, audio.state 'closed').
// Uses diagnostics.stopKey(true), which runs the actual stopReading()
// shortcut the key runs (read-aloud/player-stop.ts stopAll()), not a
// synthetic key event.
// params: none. state: reads fixtures.A, fixtures.B; writes item18.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'item18-crosstab-stopkey' };
  const itemA = S.fixtures.A.itemID;
  const itemB = S.fixtures.B.itemID;
  let rA = null, rB = null;
  for (const x of Zotero.Reader._readers || []) { if (x.itemID === itemA) rA = x; if (x.itemID === itemB) rB = x; }
  if (!rA || !rB) throw new Error('both fixtures must be open');
  const irA = rA._internalReader, irB = rB._internalReader;
  let mA = irA._readAloudManager, mB = irB._readAloudManager;

  const engineForBoth = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    const byId = {};
    for (let i = 0; i < eng.readers.length; i++) byId[eng.readers[i].itemID] = eng.readers[i];
    return { A: byId[itemA], B: byId[itemB] };
  };

  // Get A playing first
  mA.setSpeed(1);
  if (!mA.active) { try { irA.toggleReadAloudPopup(true); } catch (e) {} }
  for (let i = 0; i < 200; i++) { mA = irA._readAloudManager; if (mA.active) break; await sleep(50); }
  if (mA.paused) mA.play();
  await sleep(600);
  const beforeB = await engineForBoth();
  out.aPlayingBeforeB = { active: mA.active, paused: mA.paused, playing: beforeB.A.session.playing };

  // Now start B: A should pause
  mB.setSpeed(1);
  if (!mB.active) { try { irB.toggleReadAloudPopup(true); } catch (e) {} }
  for (let i = 0; i < 200; i++) { mB = irB._readAloudManager; if (mB.active) break; await sleep(50); }
  if (mB.paused) mB.play();
  await sleep(700);
  const afterB = await engineForBoth();
  mA = irA._readAloudManager; mB = irB._readAloudManager;
  out.startingBPausesA = {
    aPausedNow: mA.paused, aPlayingNow: afterB.A.session.playing, bActive: mB.active, bPaused: mB.paused, bPlaying: afterB.B.session.playing,
    pausedA: mA.paused === true && afterB.A.session.playing === false,
  };
  const positionsBeforeStop = { A: afterB.A.session.position, B: afterB.B.session.position };

  // The stop key: diagnostics.stopKey(true) runs the real stopReading() shortcut
  const stopResult = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup ? await Zotero.ZoteroTTS.diagnostics.stopKey(true) : '{}');
  await sleep(400);
  const afterStop = await engineForBoth();
  mA = irA._readAloudManager; mB = irB._readAloudManager;
  out.stopKey = {
    shortcut: stopResult.shortcut, taken: stopResult.taken, openBefore: stopResult.open, openAfter: stopResult.after,
    stoppedCount: stopResult.count, toast: stopResult.toast,
    aActiveAfter: mA.active, bActiveAfter: mB.active,
    aSessionEnded: afterStop.A ? afterStop.A.session.ended : null, bSessionEnded: afterStop.B ? afterStop.B.session.ended : null,
    aAudioState: afterStop.A ? afterStop.A.audio.state : null, bAudioState: afterStop.B ? afterStop.B.audio.state : null,
    positionsBeforeStop,
    positionsAfterStop: { A: afterStop.A ? afterStop.A.session.position : null, B: afterStop.B ? afterStop.B.session.position : null },
    placesKept: afterStop.A && afterStop.B && afterStop.A.session.position === positionsBeforeStop.A && afterStop.B.session.position === positionsBeforeStop.B,
  };

  S.item18 = out;
  return JSON.stringify(out, null, 1);
})();
