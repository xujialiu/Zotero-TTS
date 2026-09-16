// Item 5: playback itself is untouched. REVISED to reuse fixture-a's
// EXISTING item (state.fixtures.a; fixture-b is gone after item 3) and to
// poll longer -- a first run on this server showed activation taking as long
// as ~20 s on a later reopen (fixture-a's fourth open by this point in the
// sequence; this remote Kokoro's own latency, not the plugin's). Lets it play
// normally -- no close of any kind this time -- polling the controller's
// _currentIndex/_position for two segments' worth of advance while the
// "<provider>: … chars" synthesis and "ready ahead of playback" lines keep
// appearing (some segments are cached from items 1-2 and resolve instantly;
// later ones are fresh). Confirms diagnostics.patches().lateResults stays
// flat for the WHOLE item while the tab lives: nothing here should drop
// anything. Pauses (never closes) at the end; 90-cleanup-restore.js closes
// the tab and erases the item.
// params: none. state: reads baseline, fixtures.a; writes item5.
(async () => {
  const out = { step: 'item5-playback-normal' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const fa = S.fixtures && S.fixtures.a;
    if (!fa || fa.itemID == null) throw new Error('state.fixtures.a is missing -- item 1 must run first');
    const itemID = fa.itemID;
    out.itemID = itemID;

    await Zotero.Reader.open(itemID);
    let r = null;
    const t0open = Date.now();
    while (Date.now() - t0open < 24000) {
      r = null;
      const rs = Zotero.Reader._readers || [];
      for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID) r = rs[i];
      if (r && r._internalReader && r._internalReader._readAloudManager) break;
      await sleep(300);
    }
    if (!r || !r._internalReader || !r._internalReader._readAloudManager) throw new Error('reader or read-aloud manager never appeared for item ' + itemID);
    out.readerReadyMs = Date.now() - t0open;

    const ir = r._internalReader;
    const m = ir._readAloudManager;
    const lateResultsBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    const debugLenBefore = (await Zotero.Debug.get()).length;

    const tPlay0 = Date.now();
    await ir.toggleReadAloudPopup(true);
    out.afterToggle = { active: m.active, paused: m.paused };

    let tActive = null;
    const tActivePoll0 = Date.now();
    while (Date.now() - tActivePoll0 < 40000) {
      if (m.active) { tActive = Date.now(); break; }
      await sleep(200);
    }
    out.activatedAfterMs = tActive ? tActive - tPlay0 : null;
    out.becameActive = !!tActive;
    if (tActive && m.active && m.paused) { try { m.play(); out.explicitPlayCalled = true; } catch (e) { out.playError = String(e); } }

    const samples = [];
    const startIndex = m._controller ? (m._controller._currentIndex ?? m._controller._position ?? null) : null;
    out.startIndex = startIndex;
    const tPoll0 = Date.now();
    let maxIndex = startIndex ?? 0;
    while (Date.now() - tPoll0 < 30000) {
      const idx = m._controller ? (m._controller._currentIndex ?? m._controller._position ?? null) : null;
      samples.push({ t: Date.now() - tPoll0, index: idx, active: m.active, paused: m.paused });
      if (typeof idx === 'number' && idx > maxIndex) maxIndex = idx;
      if (typeof idx === 'number' && typeof startIndex === 'number' && idx - startIndex >= 2) break;
      await sleep(500);
    }
    out.samples = [samples[0], samples[samples.length - 1]];
    out.sampleCount = samples.length;
    out.maxIndex = maxIndex;
    out.advance = (typeof startIndex === 'number') ? maxIndex - startIndex : null;

    try { if (m.active && !m.paused) m.pause(); out.pausedAtEnd = m.paused; } catch (e) { out.pauseError = String(e); }

    const lateResultsAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    out.lateResultsBefore = lateResultsBefore;
    out.lateResultsAfter = lateResultsAfter;
    out.droppedRise = lateResultsAfter.dropped - lateResultsBefore.dropped;

    const debugFull = await Zotero.Debug.get();
    const delta = debugFull.slice(debugLenBefore);
    out.synthesisLines = (delta.match(/[a-zA-Z-]+: \d+ chars(?! ready ahead)/g) || []).slice(0, 5);
    out.readyAheadLines = (delta.match(/prefetch: [^:]+: \d+ chars ready ahead of playback/g) || []).length;
    out.dropLines = (delta.match(/late (result|failure) dropped: \S+ answered after its reader window was gone/g) || []);

    S.item5 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
