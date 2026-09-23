// Item 9: the word. A voice that times words (Fish Audio): activeTimestampIndex
// walks the words and manager.activeTimestamp is the timing the index names
// (the shadowed getter, reader.js 82230's instanceof gate removed --
// read-aloud/engine/index.ts patchManager). A voice without timings (System,
// macOS): the stand-in {start:0, end:86400} (WHOLE_SEGMENT_END_SECONDS,
// remote-interface.ts) over the whole sentence. Switching to Word mid-sentence
// (syncActiveWordToPlayback, a public member of the Engine's own controller)
// lights the current word at once.
// params: none. state: reads fixtures.A; writes item9.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'item9-word' };
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found');
  const ir = r._internalReader;
  let m = ir._readAloudManager;
  const mw = Components.utils.waiveXrays(m);

  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };

  // --- A timed voice (Fish Audio): activeTimestampIndex walks the words,
  // manager.activeTimestamp is the timing the index names ---
  m.setSpeed(1);
  m.repositionTo(4); // a longer sentence, several words to walk
  let played = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) { const e = await engineFor(); if (e.session.currentIndex === 4 && e.session.playing) { played = true; break; } await sleep(30); }
  out.reachedSegment4 = played;
  const walk = [];
  const tW0 = Date.now();
  let lastIndex = null;
  while (Date.now() - tW0 < 3000) {
    const e = await engineFor();
    const idx = e.session.activeTimestampIndex;
    if (idx !== lastIndex) {
      const timing = mw.activeTimestamp ? JSON.parse(JSON.stringify(mw.activeTimestamp)) : null;
      const controllerTimings = mw._controller && typeof mw._controller.getTimestampsForSegment === 'function'
        ? mw._controller.getTimestampsForSegment(Components.utils.waiveXrays(mw.activeSegment))
        : null;
      const named = controllerTimings && idx !== null ? (Components.utils.waiveXrays(controllerTimings)[idx] ?? null) : null;
      walk.push({ t: Date.now() - tW0, idx, activeTimestamp: timing, namedByIndex: named ? JSON.parse(JSON.stringify(named)) : null,
        matches: timing && named ? timing.start === named.start && timing.end === named.end : (timing === null && named === null) });
      lastIndex = idx;
    }
    await sleep(20);
  }
  out.wordWalk = walk;
  out.wordWalkStepsSeen = walk.length;
  out.everyStepMatched = walk.length > 0 && walk.every((w) => w.matches);
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  // --- syncActiveWordToPlayback: switching to Word mid-sentence lights the
  // current word at once (a public member of the Engine's own controller) ---
  m.setSpeed(1);
  m.repositionTo(4);
  played = false;
  const t1 = Date.now();
  while (Date.now() - t1 < 15000) { const e = await engineFor(); if (e.session.currentIndex === 4 && e.session.playing) { played = true; break; } await sleep(30); }
  await sleep(600); // let real playback progress past word 0
  const beforeSync = await engineFor();
  try { mw._controller.syncActiveWordToPlayback(); } catch (e) { out.syncError = String(e); }
  const afterSync = await engineFor();
  out.syncActiveWord = {
    reachedSegment4Again: played,
    indexBefore: beforeSync.session.activeTimestampIndex,
    indexAfterSync: afterSync.session.activeTimestampIndex,
    // The point: the call is synchronous and does not error, and the index
    // reflects real elapsed playback (>= 0 once word timings exist and audio
    // has started) -- it need not differ if the word clock had already caught
    // up (both are driven by the same audio-clock arithmetic, words.ts).
    indexNonNegative: afterSync.session.activeTimestampIndex !== null && afterSync.session.activeTimestampIndex >= 0,
  };
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  S.item9 = out;
  return JSON.stringify(out, null, 1);
})();
