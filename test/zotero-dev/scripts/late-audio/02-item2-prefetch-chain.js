// Item 2: the prefetch chain stops with the reader. REVISED after a first run
// on fixture-b (6 short, 78-char segments) found the whole chain (however
// long zotero-tts.prefetch allows) finished within a couple of seconds of the
// first "ready ahead" line -- too fast to close mid-chain. This version
// reopens fixture-a's EXISTING item (state.fixtures.a, 17 segments -- much
// more runway) with zotero-tts.prefetch temporarily raised to 10 (restored to
// the baseline value at the end of THIS script, before item 3 runs), polls
// for m.active === true (see item 1's header for why), then polls the debug
// store (sliced from a length recorded just before play(), never the whole
// store) until the FIRST "prefetch: <provider>: N chars ready ahead of
// playback" line appears -- proof the chain (remote-interface.ts
// prefetchAfter) is running -- then closes the tab immediately, the same way
// item 1 does. Expects exactly one "prefetch: <provider>: stopped, the reader
// is gone" line and no further "ready ahead" line after it. If the chain
// finishes (or never starts) before the poll catches it, this is reported NOT
// TESTABLE with the timeline observed, per the case.
// params: none. state: reads baseline, fixtures.a (item 1 must run first);
// writes item2.
(async () => {
  const out = { step: 'item2-prefetch-chain' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const fa = S.fixtures && S.fixtures.a;
    if (!fa || fa.itemID == null) throw new Error('state.fixtures.a is missing -- item 1 must run first');
    const itemID = fa.itemID;
    out.itemID = itemID;

    const prefetchBefore = Zotero.Prefs.get('zotero-tts.prefetch');
    out.prefetchBefore = prefetchBefore;
    Zotero.Prefs.set('zotero-tts.prefetch', 10);
    out.prefetchNow = { count: Zotero.Prefs.get('zotero-tts.prefetch'), enabled: Zotero.Prefs.get('zotero-tts.prefetchEnabled') };

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
    while (Date.now() - tActivePoll0 < 30000) {
      if (m.active) { tActive = Date.now(); break; }
      await sleep(150);
    }
    out.activatedAfterMs = tActive ? tActive - tPlay0 : null;
    out.becameActive = !!tActive;

    // Poll for the first "ready ahead of playback" line -- proof the chain
    // is running -- re-slicing the delta from debugLenBefore each time
    // (Zotero.Debug.get() is cumulative), never returning the whole store.
    const READY_RE = /prefetch: [^:]+: \d+ chars ready ahead of playback/;
    let foundReadyLine = null;
    let foundAtMs = null;
    const tPollStart = Date.now();
    while (Date.now() - tPollStart < 25000) {
      const delta = (await Zotero.Debug.get()).slice(debugLenBefore);
      const m2 = delta.match(READY_RE);
      if (m2) { foundReadyLine = m2[0]; foundAtMs = Date.now() - tPlay0; break; }
      await sleep(250);
    }
    out.foundReadyLine = foundReadyLine;
    out.foundAtMs = foundAtMs;
    out.chainRunning = !!foundReadyLine;

    const tClose = Date.now();
    r._window.Zotero_Tabs.close(r.tabID);
    out.closedAtMs = tClose - tPlay0;

    await sleep(5000);

    const lateResultsAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    out.lateResultsBefore = lateResultsBefore;
    out.lateResultsAfter = lateResultsAfter;
    out.droppedRise = lateResultsAfter.dropped - lateResultsBefore.dropped;
    out.getAudioRise = (lateResultsAfter.byMethod.getAudio ?? 0) - (lateResultsBefore.byMethod.getAudio ?? 0);

    const finalDelta = await Zotero.Debug.get();
    const deltaFromBefore = finalDelta.slice(debugLenBefore);
    const STOP_RE = /prefetch: [^:]+: stopped, the reader is gone/g;
    const stopMatches = [...deltaFromBefore.matchAll(STOP_RE)];
    out.stopLineCount = stopMatches.length;
    out.stopLines = stopMatches.map((mm) => mm[0]);
    const readyMatches = [...deltaFromBefore.matchAll(new RegExp(READY_RE, 'g'))];
    out.readyLineCount = readyMatches.length;
    if (stopMatches.length) {
      const stopIndex = stopMatches[0].index;
      const readyAfterStop = readyMatches.filter((mm) => mm.index > stopIndex);
      out.readyLinesAfterStop = readyAfterStop.length;
    } else {
      out.readyLinesAfterStop = null;
    }

    out.readersStillOpenForItem = (Zotero.Reader._readers || []).some((x) => x.itemID === itemID);

    // Restore the prefetch setting to what 00 captured, before item 3 runs.
    Zotero.Prefs.set('zotero-tts.prefetch', prefetchBefore);
    out.prefetchRestored = Zotero.Prefs.get('zotero-tts.prefetch') === prefetchBefore;

    S.item2 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
