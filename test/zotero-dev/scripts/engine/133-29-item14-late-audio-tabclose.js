// Item 14: a tab closed while a slow sentence is on its way. Fixture C
// (already on local::df_fake, the fake server) is repositioned to a
// never-yet-cached segment under "slow" mode (1.5s per answer), then its
// tab is closed a few hundred ms later, well before that answer lands.
// Expected: no "can't access dead object" in the console; the debug line
// "late audio dropped: its reader window was gone"
// (read-aloud/engine/index.ts fetchFor) and/or
// diagnostics.patches().lateResults counting it (the reader-realm side,
// window-interface.ts) for the Engine's own late fetch; the warm chain's
// own "prefetch: local: stopped, the reader is gone" line
// (remote-interface.ts prefetchAfter) since prefetchEnabled is on by
// default (baseline).
// params: modeFile. state: reads fixtures.C; writes item14.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const itemID = S.fixtures.C.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) {
    // The first attempt at this script closed fixture C's tab already (its
    // own late-detection came up empty, on an already-cached segment) --
    // reopen it for this retry.
    await Zotero.Reader.open(itemID);
    const t0open = Date.now();
    while (Date.now() - t0open < 24000) {
      r = null;
      for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
      if (r && r._internalReader && r._internalReader._readAloudManager) break;
      await sleep(300);
    }
  }
  if (!r) throw new Error('fixture C reader not found');
  const ir = r._internalReader;
  let m = ir._readAloudManager;
  const modeFile = Zotero.ZoteroTTSRun.params.modeFile;
  const setMode = (mode) => IOUtils.writeUTF8(modeFile, mode);

  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);

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

  // A fresh fifth fake voice: every earlier segment/voice pairing in this
  // run had already been read at least once by the time this test ran
  // (extensive incidental background reading across many earlier scripts),
  // so nothing would genuinely still be in flight to observe as "late".
  await setMode('ok');
  m = ir._readAloudManager;
  if (!m.active) {
    r._iframeWindow.document.notifyUserGestureActivation();
    ir.toggleReadAloudPopup(true);
    const t0a = Date.now();
    while (Date.now() - t0a < 20000) { m = ir._readAloudManager; if (m.active) break; await sleep(50); }
  }
  m.setSpeed(1);
  if (m.paused) m.play();
  let t0s = Date.now();
  while (Date.now() - t0s < 15000) { const e = await engineFor(); if (e.session.playing) break; await sleep(50); }
  m.selectTier('kokoro');
  await sleep(200);
  m = ir._readAloudManager;
  m.loadVoices(true);
  await sleep(1500);
  m = ir._readAloudManager;
  m.selectVoice('local::gf_fake');
  t0s = Date.now();
  let committed = false;
  while (Date.now() - t0s < 20000) {
    const vs = await voiceSwitchFor();
    if (vs && vs.handoff && vs.handoff.last && vs.handoff.last.to === 'local::gf_fake' && vs.handoff.stage === 'committed') { committed = true; break; }
    await sleep(30);
  }
  if (!committed) throw new Error('never committed to local::gf_fake');
  await sleep(200);

  const errorsBefore = await new Promise((resolve) => {
    try { resolve(Zotero.getErrors ? Zotero.getErrors(true) : []); } catch (e) { resolve([]); }
  });
  const patchesBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches());
  const debugBefore = await Zotero.Debug.get();

  await setMode('slow');
  m = ir._readAloudManager;
  m.repositionTo(6); // segment 5 is now cached (the provider-level cache in remote-interface.ts still filled even though the Engine's own fetchFor dropped it for the dead window last time) -- 6 is still fresh
  await sleep(900); // well inside the 1.5s slow answer, but late enough for the plugin's own warm chain (one request, after the Engine's own read-ahead pair) to have started too
  const win = r._window;
  const tabID = r.tabID;
  win.Zotero_Tabs.close(tabID);
  await sleep(2500); // past the 1.5s slow answer, so the late result actually lands

  await setMode('ok');
  const patchesAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches());
  const debugAfter = await Zotero.Debug.get();
  const debugDelta = debugAfter.slice(debugBefore.length);
  const errorsAfter = await new Promise((resolve) => {
    try { resolve(Zotero.getErrors ? Zotero.getErrors(true) : []); } catch (e) { resolve([]); }
  });
  const newErrors = errorsAfter.filter((e) => !errorsBefore.includes(e));
  const deadObjectCount = (debugDelta.match(/can't access dead object/g) || []).length;
  const deadObjectErrorLines = newErrors.filter((e) => String(e).includes("can't access dead object"));
  const lateAudioLineSeen = /late audio dropped: its reader window was gone/.test(debugDelta);
  const prefetchStoppedLineSeen = /prefetch: local: stopped, the reader is gone/.test(debugDelta);
  const readerStillOpen = (Zotero.Reader._readers || []).some((x) => x.itemID === itemID);

  const out = {
    step: 'item14-late-audio-tabclose',
    readerClosed: !readerStillOpen,
    deadObjectDebugLines: deadObjectCount,
    deadObjectConsoleErrors: deadObjectErrorLines.length,
    lateAudioLineSeen,
    prefetchStoppedLineSeen,
    lateResults: { before: patchesBefore.lateResults, after: patchesAfter.lateResults },
    lateResultsDroppedDelta: (patchesAfter.lateResults ? patchesAfter.lateResults.dropped : null) - (patchesBefore.lateResults ? patchesBefore.lateResults.dropped : null),
    debugDeltaSample: (debugDelta.match(/[^\n]*late audio dropped[^\n]*/) || [null])[0] || (debugDelta.match(/[^\n]*prefetch: local[^\n]*/) || [null])[0],
    newErrorsCount: newErrors.length,
    newErrorsSample: newErrors.slice(0, 3).map((e) => String(e).slice(0, 200)),
  };
  S.item14 = out;
  return JSON.stringify(out, null, 1);
})();
