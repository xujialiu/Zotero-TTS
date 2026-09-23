// Item 6: speed (a mid-sentence change re-stretches at the same position --
// a hard cut, playbackTime continues, the sentence does not restart; paused
// or in the gap it applies at the next start; a trusted key still reaches
// the session). Item 7: volume (audio.gain = level/100 on the open session,
// moved at once by the pref and by the trusted Shift+ArrowUp/Down keys
// without a new AudioContext; a stored level above 100 never reaches the
// gain). Reuses fixture A (already open, paused; 133-02..06 fetched most of
// its segments, so this is quick).
// params: none. state: reads fixtures.A; writes item6, item7.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out6 = { step: 'item6-speed' };
  const out7 = { step: 'item7-volume' };
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found');
  const ir = r._internalReader;
  let m = ir._readAloudManager;
  if (!m.active) throw new Error('manager not active');
  const rw = r._iframeWindow;

  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };
  const waitPlayingIndex = async (index, ceilingMs = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs) {
      const eng = await engineFor();
      if (eng.session.currentIndex === index && eng.session.playing) return eng;
      await sleep(30);
    }
    return await engineFor();
  };

  // --- Item 6: a mid-sentence hard cut ---
  m.setSpeed(1);
  m.repositionTo(4); // "The later sentences are a little longer..." -- more room mid-sentence
  let eng = await waitPlayingIndex(4);
  // Let a little real audio play before changing speed, so playbackTime is meaningfully > 0
  await sleep(300);
  const before = await engineFor();
  m.setSpeed(2);
  // Read immediately: a hard cut re-stretches without resetting playbackTime or currentIndex
  const justAfter = await engineFor();
  out6.midSentenceCut = {
    speedBefore: before.session.speed, speedAfter: justAfter.session.speed,
    playbackTimeBefore: before.session.playbackTime, playbackTimeJustAfter: justAfter.session.playbackTime,
    currentIndexBefore: before.session.currentIndex, currentIndexAfter: justAfter.session.currentIndex,
    clipDuration: before.session.clipDuration,
    continuedNotRestarted: justAfter.session.playbackTime >= before.session.playbackTime - 0.05 && justAfter.session.currentIndex === before.session.currentIndex,
  };
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  // --- Item 6: a paused change applies at the next start, not retroactively ---
  // REVISED (2026-09-23): the first version tried to catch the change while
  // `inGap`, but the default sentence gap is 0 ms (issue #44's own default) --
  // an 8 s / 15 ms poll never once saw inGap true. Pausing mid-sentence is
  // the same claim (session.ts setSpeed's early return when !isPlaying) and
  // is trivial to catch and hold open as long as needed.
  m.setSpeed(1);
  m.repositionTo(5); // "The second paragraph talks about nothing..." -- enough length to pause mid-way
  let played = false;
  const tPl0 = Date.now();
  while (Date.now() - tPl0 < 12000) { const e = await engineFor(); if (e.session.currentIndex === 5 && e.session.playing) { played = true; break; } await sleep(30); }
  out6.pausedSpeedChange = { reachedSegment5: played };
  if (played) {
    await sleep(250);
    m.pause();
    await sleep(80);
    const whilePaused = await engineFor();
    m.setSpeed(2.5); // changed while paused -- must not disturb the frozen clip
    await sleep(80);
    const justAfterChange = await engineFor();
    m.play();
    await sleep(200);
    const afterResume = await engineFor();
    Object.assign(out6.pausedSpeedChange, {
      pausedSpeed: whilePaused.session.speed,
      pausedPlaybackTime: whilePaused.session.playbackTime,
      speedRightAfterChangeWhilePaused: justAfterChange.session.speed,
      playbackTimeUnchangedWhilePaused: justAfterChange.session.playbackTime === whilePaused.session.playbackTime,
      resumedSpeed: afterResume.session.speed,
      resumedCurrentIndex: afterResume.session.currentIndex,
      appliedAtResume: afterResume.session.speed === 2.5 && afterResume.session.currentIndex === 5,
    });
  }
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  // --- Item 6: a trusted key still reaches the session (Shift+C = speedUp, +0.05) ---
  m.setSpeed(1);
  m.repositionTo(2);
  await waitPlayingIndex(2);
  const speedBeforeKey = (await engineFor()).session.speed;
  Zotero_Tabs.select(r.tabID);
  try { r._window.focus(); } catch (e) {}
  try { rw.focus(); } catch (e) {}
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const host = r._window;
  const K = host.KeyboardEvent;
  const ev = (key, code, keyCode, shiftKey) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
  tip.beginInputTransactionForTests(host);
  const keyRet = [tip.keydown(ev('Shift', 'ShiftLeft', 16, true)), tip.keydown(ev('C', 'KeyC', 67, true)), tip.keyup(ev('C', 'KeyC', 67, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16, false))];
  if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
  await sleep(200);
  const speedAfterKey = (await engineFor()).session.speed;
  out6.speedKey = { keydownConsumed: keyRet[1], before: speedBeforeKey, after: speedAfterKey, delta: Math.round((speedAfterKey - speedBeforeKey) * 100) / 100 };
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  // --- Item 7: volume ---
  const PREFIX = 'zotero-tts.';
  const getVol = () => Zotero.Prefs.get(PREFIX + 'readAloud.volume');
  const setVol = (v) => Zotero.Prefs.set(PREFIX + 'readAloud.volume', v);
  const volBefore = getVol(); // 0, the mute-by-default value
  m.setSpeed(1);
  m.repositionTo(2);
  await waitPlayingIndex(2);
  const audio0 = (await engineFor()).audio;
  setVol(50);
  await sleep(80);
  const audio50 = (await engineFor()).audio;
  setVol(100);
  await sleep(80);
  const audio100 = (await engineFor()).audio;
  // The keys, without a new AudioContext
  Zotero_Tabs.select(r.tabID);
  try { r._window.focus(); } catch (e) {}
  try { rw.focus(); } catch (e) {}
  const tip2 = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  tip2.beginInputTransactionForTests(host);
  const keyRet2 = [tip2.keydown(ev('Shift', 'ShiftLeft', 16, true)), tip2.keydown(ev('ArrowDown', 'ArrowDown', 40, true)), tip2.keyup(ev('ArrowDown', 'ArrowDown', 40, true)), tip2.keyup(ev('Shift', 'ShiftLeft', 16, false))];
  if (typeof tip2.endInputTransaction === 'function') tip2.endInputTransaction();
  await sleep(150);
  const audioAfterKey = (await engineFor()).audio;
  const volAfterKey = getVol();
  // A stored level above 100 never reaches the gain
  setVol(150);
  await sleep(80);
  const audioAbove100 = (await engineFor()).audio;
  setVol(0); // back to muted for the rest of the run
  await sleep(80);
  const audioRestoredMute = (await engineFor()).audio;
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  out7.volumeBefore = volBefore;
  out7.gainAt50 = audio50.gain; out7.expectedAt50 = 0.5;
  out7.gainAt100 = audio100.gain; out7.expectedAt100 = 1.0;
  out7.contextsUnchangedAcrossPrefChange = audio0.contexts === audio50.contexts && audio50.contexts === audio100.contexts;
  out7.keyChangedPref = { before: 100, after: volAfterKey, isLower: volAfterKey < 100 };
  out7.keyChangedGain = audioAfterKey.gain;
  out7.contextsUnchangedAcrossKey = audio100.contexts === audioAfterKey.contexts;
  out7.gainAbove100PrefClamped = audioAbove100.gain;
  out7.gainNeverExceeds1 = audio50.gain <= 1 && audio100.gain <= 1 && audioAfterKey.gain <= 1 && audioAbove100.gain <= 1;
  out7.mutedRestored = { volumePref: getVol(), gain: audioRestoredMute.gain };

  S.item6 = out6;
  S.item7 = out7;
  return JSON.stringify({ item6: out6, item7: out7 }, null, 1);
})();
