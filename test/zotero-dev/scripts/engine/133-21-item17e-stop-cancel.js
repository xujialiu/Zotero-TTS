// Item 17(e), the last third: Stop cancels a pending switch too, but
// (unlike skip/speed/jump) closes the player instead of leaving the old
// voice reading on. Opens fixture B fresh (its own reader, so fixture A's
// state is untouched), starts a plugin-voice reading, picks a slow-to-answer
// target mid-sentence, then calls the real stop key
// (diagnostics.stopKey(true) -- read-aloud/player-stop.ts stopAll(), not a
// synthetic key) while the switch is still preparing.
// params: modeFile, fakeLocalVoiceID. state: reads fixtures.B (imported in
// 133-01, not yet opened this run); writes item17eStop.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const itemID = S.fixtures.B.itemID;
  const modeFile = Zotero.ZoteroTTSRun.params.modeFile;
  const setMode = (mode) => IOUtils.writeUTF8(modeFile, mode);

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
  if (!r) throw new Error('fixture B reader never appeared');
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

  r._iframeWindow.document.notifyUserGestureActivation();
  ir.toggleReadAloudPopup(true);
  let tActive = null;
  const tA0 = Date.now();
  while (Date.now() - tA0 < 30000) { m = ir._readAloudManager; if (m.active) { tActive = Date.now(); break; } await sleep(50); }
  if (!tActive) throw new Error('manager never activated for fixture B');
  m.setSpeed(1);
  if (m.paused) m.play();
  const t0play = Date.now();
  let played = false;
  while (Date.now() - t0play < 20000) { const e = await engineFor(); if (e.session.playing) { played = true; break; } await sleep(50); }

  const before = await engineFor();
  const fromVoice = before.session.voice;
  const target = fromVoice === Zotero.ZoteroTTSRun.params.fakeLocalVoiceID ? 'local::bf_fake' : Zotero.ZoteroTTSRun.params.fakeLocalVoiceID;

  await setMode('slow'); // keeps the target pending long enough to catch mid-flight
  m.selectVoice(target);
  await sleep(350);
  const preparing = await voiceSwitchFor();
  const wasPreparing = !!(preparing && preparing.handoff && preparing.handoff.pending === target);

  const stopResult = JSON.parse(await Zotero.ZoteroTTS.diagnostics.stopKey(true));
  await sleep(400);
  await setMode('ok');
  const after = await voiceSwitchFor();
  const afterEngine = await engineFor();

  const out = {
    step: 'item17e-stop-cancel',
    played, fromVoice, target,
    wasPreparing,
    stopKey: { taken: stopResult.taken, count: stopResult.count, toast: stopResult.toast },
    stageAfterStop: after && after.handoff ? after.handoff.stage : null,
    cancelledOrGone: !after || !after.handoff || after.handoff.stage === 'cancelled' || after.handoff.stage === null,
    readerStillOpen: (Zotero.Reader._readers || []).some((x) => x.itemID === itemID),
    sessionEnded: afterEngine ? afterEngine.session.ended : 'reader-closed',
    audioState: afterEngine ? afterEngine.audio.state : 'reader-closed',
  };
  S.item17eStop = out;
  return JSON.stringify(out, null, 1);
})();
