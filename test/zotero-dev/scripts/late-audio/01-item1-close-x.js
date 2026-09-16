// Item 1: a late result after the x path. Imports fixture-a.pdf fresh (its
// text has never been spoken by this plugin instance, so the very first
// getAudio is guaranteed to be a cache miss -- a genuine network round trip
// to Kokoro), opens it, calls play() (toggleReadAloudPopup(true)).
//
// TWICE REVISED. First: toggleReadAloudPopup(true) resolves in single-digit
// ms WITHOUT starting playback -- the manager's first getVoices() call for a
// freshly enabled provider is itself slow (measured 273 ms-2992 ms live, once
// 20 s) and gates activation, so a delay measured from the toggle call mostly
// caught getVoices(), not getAudio(). Fixed by polling for m.active === true
// first. Second: even closing ~30 ms after activation (live, after an
// in-place reinstall for a guaranteed-cold cache) still caught nothing --
// fixture-a's segment 0 is "Zotero-TTS fixture A, page one." (31 chars: the
// debug store's own "local: 5 word timestamps for 31 chars" line), which this
// Kokoro resolves too fast to catch regardless of delay. So this version lets
// segment 0 resolve (whatever that takes -- not the point of this item),
// pauses, then repositions the LIVE controller to the fixture's own longest
// segment (its "It mentions the number forty-two..." sentence, ~115 chars per
// the fixture's design comment that later sentences run longer) by writing
// `controller._currentIndex`/`_position` directly -- the pattern
// angle-brackets/groups-08-prefetch.js already uses for the same controller
// -- and resumes with m.play(). THAT dispatch is what gets ~250 ms, then the
// tab close the x does (reader._window.Zotero_Tabs.close(reader.tabID)) --
// not eraseTx, not the popup's own close button. Waits 5 s more, then reads
// diagnostics.patches().lateResults, the debug store's new lines (sliced from
// the length recorded just before the repositioned play(), never the whole
// store) and the console's dead-object entries newer than the run's start,
// excluding the pre-existing baseline.
//
// Works with either provider readAloud.memory names -- Kokoro (local, free,
// but this h200's GPU has answered too fast to catch on every attempt so
// far, cold cache or not) or MiMo (mimo, paid per request, run
// 00b-mimo-override.js first: this is the combination that actually produced
// a clean getAudio drop live, 2026-09-16).
//
// The fixture's item is NOT erased here -- items 2, 4 and 5 reopen the same
// item, and 90-cleanup-restore.js erases it at the end. params: none. state:
// reads baseline; writes fixtures.a and item1 (the measurements).
(async () => {
  const out = { step: 'item1-close-x' };
  const S = Zotero.ZoteroTTSRun.state;
  const Ci = Components.interfaces;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const file = PathUtils.join(Zotero.ZoteroTTSRun.params.fixturesDir, 'fixture-a.pdf');
    const title = 'ztts issue116 late-audio A ' + new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const item = await Zotero.Attachments.importFromFile({ file, title, libraryID: Zotero.Libraries.userLibraryID });
    S.fixtures.a = { itemID: item.id, key: item.key, title };
    out.itemID = item.id;
    out.title = item.getField('title');

    await Zotero.Reader.open(item.id);
    let r = null;
    const t0open = Date.now();
    while (Date.now() - t0open < 24000) {
      r = null;
      const rs = Zotero.Reader._readers || [];
      for (let i = 0; i < rs.length; i++) if (rs[i].itemID === item.id) r = rs[i];
      if (r && r._internalReader && r._internalReader._readAloudManager) break;
      await sleep(300);
    }
    if (!r || !r._internalReader || !r._internalReader._readAloudManager) throw new Error('reader or read-aloud manager never appeared for item ' + item.id);
    out.readerReadyMs = Date.now() - t0open;
    S.fixtures.a.tabID = r.tabID;

    const ir = r._internalReader;
    const m = ir._readAloudManager;
    out.before = { active: m.active, paused: m.paused };

    const tOpen0 = Date.now();
    await ir.toggleReadAloudPopup(true);
    out.playCallMs = Date.now() - tOpen0;
    out.afterToggle = { active: m.active, paused: m.paused };

    // Poll for activation on segment 0 (voices resolved, a voice picked) --
    // generous ceiling, this server's first catalog call has measured
    // anywhere from ~0.3 s to ~20 s live. Segment 0's own getAudio (31 chars)
    // is left to resolve normally: it is not what this item measures.
    let tActive = null;
    const tActivePoll0 = Date.now();
    while (Date.now() - tActivePoll0 < 30000) {
      if (m.active) { tActive = Date.now(); break; }
      await sleep(20);
    }
    out.activatedAfterMs = tActive ? tActive - tOpen0 : null;
    out.becameActive = !!tActive;
    if (!tActive) throw new Error('manager never activated within 30 s');

    // Reposition to the fixture's own longest segment (see header) so the
    // NEXT getAudio dispatch is one this Kokoro cannot resolve in a handful
    // of ms -- the pattern angle-brackets/groups-08-prefetch.js already uses
    // on this same controller (_currentIndex/_position, direct assignment).
    const controller = m._controller;
    if (!controller || !Array.isArray(controller._segments)) throw new Error('controller._segments not available to reposition');
    const segs = controller._segments;
    let longestIdx = 0;
    let longestLen = 0;
    for (let i = 0; i < segs.length; i++) {
      const t = segs[i] && segs[i].text;
      if (typeof t === 'string' && t.length > longestLen) { longestLen = t.length; longestIdx = i; }
    }
    out.repositionTarget = { index: longestIdx, textLength: longestLen, segmentCount: segs.length };
    try { if (m.active && !m.paused) m.pause(); } catch (e) { out.prePauseError = String(e); }
    await sleep(150);
    controller._currentIndex = longestIdx;
    controller._position = longestIdx;
    out.repositioned = { currentIndex: controller._currentIndex, position: controller._position };

    const lateResultsBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    const debugLenBefore = (await Zotero.Debug.get()).length;

    const tPlay0 = Date.now();
    try { m.play(); out.resumeCalled = true; } catch (e) { out.resumeError = String(e); }
    out.afterResume = { active: m.active, paused: m.paused };

    await sleep(250);
    out.delayBeforeCloseMs = Date.now() - tPlay0;

    const tClose = Date.now();
    r._window.Zotero_Tabs.close(r.tabID);
    out.closedAtMs = tClose - tPlay0;

    await sleep(5000);

    const lateResultsAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    out.lateResultsBefore = lateResultsBefore;
    out.lateResultsAfter = lateResultsAfter;
    out.droppedRise = lateResultsAfter.dropped - lateResultsBefore.dropped;
    out.getAudioRise = (lateResultsAfter.byMethod.getAudio ?? 0) - (lateResultsBefore.byMethod.getAudio ?? 0);
    out.lastDrop = lateResultsAfter.last.length ? lateResultsAfter.last[lateResultsAfter.last.length - 1] : null;

    const debugFull = await Zotero.Debug.get();
    const delta = debugFull.slice(debugLenBefore);
    out.debugDeltaLen = delta.length;
    out.dropLines = (delta.match(/late (result|failure) dropped: \S+ answered after its reader window was gone/g) || []);
    out.getAudioDropLineCount = (delta.match(/late result dropped: getAudio answered after its reader window was gone/g) || []).length;

    out.readersStillOpenForItem = (Zotero.Reader._readers || []).some((x) => x.itemID === item.id);

    const arr = Services.console.getMessageArray() || [];
    const baseline = (S.baseline && S.baseline.deadBaseline) || [];
    const isBaseline = (ts, col) => baseline.some((b) => b.timeStamp === ts && b.columnNumber === col);
    const newDead = [];
    for (let i = 0; i < arr.length; i++) {
      let se = null;
      try { se = arr[i].QueryInterface(Ci.nsIScriptError); } catch (e) { se = null; }
      const msg = (se && se.errorMessage) || arr[i].message || '';
      if (/can't access dead object/i.test(String(msg)) && se && se.timeStamp >= tPlay0 && !isBaseline(se.timeStamp, se.columnNumber)) {
        newDead.push({ timeStamp: se.timeStamp, sourceName: se.sourceName, columnNumber: se.columnNumber, lineNumber: se.lineNumber });
      }
    }
    out.newDeadObjectEntries = newDead;
    S.item1 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
