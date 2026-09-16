// Item 4 (control): a quiet close. REVISED to reuse fixture-a's EXISTING item
// (state.fixtures.a -- fixture-b was consumed and erased by item 3). Reopens
// it, opens the popup then closes it again at once
// (toggleReadAloudPopup(false) right after (true)), then waits >= 5 s BEFORE
// closing the tab -- long enough for whatever single request that brief open
// triggered (this server's own getVoices()/getAudio() round trips measured
// well under 5 s on this run once activation gets going) to have already
// landed, so nothing is in flight when Zotero_Tabs.close actually runs.
// Cached segments from items 1-2 make this MORE certain, not less: a cache
// hit resolves synchronously. Expected: dropped unchanged, no
// "late result dropped" line, no error.
// params: none. state: reads baseline, fixtures.a; writes item4.
(async () => {
  const out = { step: 'item4-quiet-close' };
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

    const t0 = Date.now();
    await ir.toggleReadAloudPopup(true);
    out.afterOpen = { active: m.active, paused: m.paused };
    ir.toggleReadAloudPopup(false);
    out.popupClosedAtMs = Date.now() - t0;

    await sleep(7000);
    out.waitedMs = Date.now() - t0;

    r._window.Zotero_Tabs.close(r.tabID);
    out.closedAtMs = Date.now() - t0;

    await sleep(2000);

    const lateResultsAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    out.lateResultsBefore = lateResultsBefore;
    out.lateResultsAfter = lateResultsAfter;
    out.droppedRise = lateResultsAfter.dropped - lateResultsBefore.dropped;

    const debugFull = await Zotero.Debug.get();
    const delta = debugFull.slice(debugLenBefore);
    out.dropLines = (delta.match(/late (result|failure) dropped: \S+ answered after its reader window was gone/g) || []);

    out.readersStillOpenForItem = (Zotero.Reader._readers || []).some((x) => x.itemID === itemID);
    S.item4 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
