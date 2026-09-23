// Item 4 (continued): a genuine, never-cached read, to see the plugin's own
// warm chain actually log "prefetch: fish: N chars ready ahead of playback"
// (fixture-a's segments were all warmed already by 133-02..05, an
// unsupervised ~2-minute playing gap between two tool calls included -- see
// the kit README). Item 15: end of the document, on fixture-b.pdf (6
// segments), read once from its own first open through to completion.
// params: none. state: reads fixtures.B (imported in 133-01); writes
// item4Fresh, item15.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out4 = { step: 'item4-fresh-prefetch' };
  const out15 = { step: 'item15-end-of-document' };
  const itemID = S.fixtures.B.itemID;

  await Zotero.Reader.open(itemID);
  let r = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 24000) {
    r = null;
    for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
    if (r && r._internalReader && r._internalReader._readAloudManager) break;
    await sleep(300);
  }
  if (!r) throw new Error('fixture B reader never appeared');
  S.fixtures.B.tabID = r.tabID;
  const ir = r._internalReader;
  let m = ir._readAloudManager;

  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };

  const debugLenBefore = (await Zotero.Debug.get()).length;
  r._iframeWindow.document.notifyUserGestureActivation();
  ir.toggleReadAloudPopup(true);
  let tActive = null;
  const tA0 = Date.now();
  while (Date.now() - tA0 < 30000) { m = ir._readAloudManager; if (m.active) { tActive = Date.now(); break; } await sleep(50); }
  if (!tActive) throw new Error('manager never activated for fixture B');
  m.setSpeed(1);

  // Watch it read the whole (short) document through to Complete: the
  // manager pauses with activeSegment null, active stays true, ended stays
  // false, position returns to where the reading began.
  const segs = ir._readAloudSegments.segments;
  out15.segCount = segs.length;
  let sawComplete = false;
  const tW0 = Date.now();
  let lastPosition = null;
  while (Date.now() - tW0 < 30000) {
    m = ir._readAloudManager;
    const eng = await engineFor();
    lastPosition = eng.session.position;
    if (m.active && m.paused && !m.activeSegment && eng.session.ended === false) { sawComplete = true; break; }
    await sleep(60);
  }
  out15.sawComplete = sawComplete;
  out15.watchMs = Date.now() - tW0;
  const engAtEnd = await engineFor();
  out15.atEnd = {
    active: m.active, paused: m.paused, activeSegmentNull: !m.activeSegment,
    sessionEnded: engAtEnd.session.ended, sessionPosition: engAtEnd.session.position,
  };
  out15.savedPosition = (() => {
    const p = ir._state && ir._state.readAloudState && ir._state.readAloudState.savedPosition;
    return p ? 'set (a real source position, not printed)' : p;
  })();

  // Play starts there (position back to the reading's own start, 0 for this
  // fresh first-ever open)
  if (sawComplete) {
    m.play();
    let started = false;
    const tP0 = Date.now();
    while (Date.now() - tP0 < 8000) {
      m = ir._readAloudManager;
      if (m.active && !m.paused && m.activeSegment) { started = true; break; }
      await sleep(40);
    }
    const engAfterPlay = await engineFor();
    out15.resumedAt = { started, index: (() => {
      const seg = m.activeSegment; if (!seg) return -1;
      for (let i = 0; i < segs.length; i++) if (segs[i] === seg) return i;
      return -1;
    })(), sessionPosition: engAfterPlay.session.position };
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  }

  const debugFull = await Zotero.Debug.get();
  const delta = debugFull.slice(debugLenBefore);
  const prefetchLines = delta.match(/prefetch: \S+: \d+ chars ready ahead of playback/g) || [];
  const freshFetchLines = (delta.match(/fish: \d+ word timestamps? for \d+ chars[^\n]*/g) || []);
  out4.prefetchLines = prefetchLines;
  out4.prefetchLineCount = prefetchLines.length;
  out4.freshFetchLines = freshFetchLines;
  out4.allFreshFetchesUncached = freshFetchLines.length > 0 && freshFetchLines.every((l) => !l.includes('(cached)'));

  S.item4Fresh = out4;
  S.item15 = out15;
  return JSON.stringify({ item4Fresh: out4, item15: out15 }, null, 1);
})();
