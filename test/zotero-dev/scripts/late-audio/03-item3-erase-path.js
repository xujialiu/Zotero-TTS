// Item 3: the erase path, as the kits' teardown does it. Uses fixture-b.pdf
// fresh (not fixture-a, which items 1-2 already cache several segments of)
// and, per item 1's header, polls for m.active === true before doing
// anything else, so the manager's slow first getVoices() (this remote
// Kokoro, 0.3-3 s+ live) does not eat the 300 ms/300 ms countdown below.
//
// Like item 1: segment 0 alone is too short/fast for this Kokoro to catch
// regardless of delay (live evidence: 0/0/0 drops across three attempts at
// 30-300 ms after activation, even with a guaranteed-cold cache after an
// in-place reinstall). So this version lets segment 0 resolve, pauses,
// repositions the live controller to fixture-b's own longest segment
// (`controller._currentIndex`/`_position`, the pattern
// angle-brackets/groups-08-prefetch.js already uses), and resumes with
// m.play() -- THAT dispatch is what gets the 300 ms/300 ms countdown: closes
// the popup (toggleReadAloudPopup(false), NOT eraseTx yet), waits ~300 ms
// more, then erases the item (item.eraseTx()) -- the sequence of
// openai-split/05-cleanup-restore.js, and the one the issue was found on.
// Expected as item 1: dropped up by >= 1 with the rise in byMethod.getAudio,
// no NEW dead-object console line, no other zotero-tts.js line. Works with
// either provider readAloud.memory names -- see item 1's header for which
// combination actually caught it live (MiMo, via 00b-mimo-override.js).
// This is fixture-b's only use this run: it is gone after this script.
// params: none. state: reads baseline; writes fixtures.b and item3.
(async () => {
  const out = { step: 'item3-erase-path' };
  const S = Zotero.ZoteroTTSRun.state;
  const Ci = Components.interfaces;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const file = PathUtils.join(Zotero.ZoteroTTSRun.params.fixturesDir, 'fixture-b.pdf');
    const title = 'ztts issue116 late-audio B ' + new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const item = await Zotero.Attachments.importFromFile({ file, title, libraryID: Zotero.Libraries.userLibraryID });
    S.fixtures.b = { itemID: item.id, key: item.key, title };
    const itemID = item.id;
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

    const tOpen0 = Date.now();
    await ir.toggleReadAloudPopup(true);
    out.afterToggle = { active: m.active, paused: m.paused };

    let tActive = null;
    const tActivePoll0 = Date.now();
    while (Date.now() - tActivePoll0 < 30000) {
      if (m.active) { tActive = Date.now(); break; }
      await sleep(20);
    }
    out.activatedAfterMs = tActive ? tActive - tOpen0 : null;
    out.becameActive = !!tActive;
    if (!tActive) throw new Error('manager never activated within 30 s');

    // Reposition to fixture-b's own longest segment (see header).
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
    const tBase = tPlay0;

    await sleep(300);
    out.popupCloseAtMs = Date.now() - tBase;
    ir.toggleReadAloudPopup(false);

    await sleep(300);
    out.eraseAtMs = Date.now() - tBase;
    const liveItem = Zotero.Items.get(itemID);
    const parent = liveItem && liveItem.parentItem;
    if (parent) { await parent.eraseTx(); out.erasedParent = true; }
    else if (liveItem) { await liveItem.eraseTx(); out.erased = true; }
    else { out.eraseNote = 'item already gone'; }

    await sleep(5000);

    const lateResultsAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    out.lateResultsBefore = lateResultsBefore;
    out.lateResultsAfter = lateResultsAfter;
    out.droppedRise = lateResultsAfter.dropped - lateResultsBefore.dropped;
    out.getAudioRise = (lateResultsAfter.byMethod.getAudio ?? 0) - (lateResultsBefore.byMethod.getAudio ?? 0);
    out.lastDrop = lateResultsAfter.last.length ? lateResultsAfter.last[lateResultsAfter.last.length - 1] : null;

    const debugFull = await Zotero.Debug.get();
    const delta = debugFull.slice(debugLenBefore);
    out.dropLines = (delta.match(/late (result|failure) dropped: \S+ answered after its reader window was gone/g) || []);
    out.deltaLineCount = delta.split('\n').filter((l) => l.trim()).length;

    const stillThere = await Zotero.Items.getAsync(itemID).catch(() => null);
    out.itemGone = !stillThere;

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
    // Zotero One's own NS_ERROR_FILE_UNRECOGNIZED_PATH at an erase is its
    // own noise, not a finding (rulebook) -- not filtered out here, just
    // named so the report does not mistake it for one of ours.
    S.item3 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
