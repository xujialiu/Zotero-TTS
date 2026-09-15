// Imports fixture A and B fresh (erased at cleanup), opens the standing
// EPUB (params.epubItemID -- "ZTTS Return-Key EPUB", found by title with
// zotero_db_query before the run; never erased), and starts+pauses a session on A and
// the EPUB at once -- the memory now names azure::en-US-ChristopherNeural
// (01-provider-and-voice-prep.js), so this never touches Fish. B stays a
// true idle reader: its tab opens but no session is ever started on it
// (needed as-is for word-highlight-key.md's "idle reader" item).
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const params = Zotero.ZoteroTTSRun.params;
  const fixturesDir = params.fixturesDir;
  const win = Zotero.getMainWindow ? Zotero.getMainWindow() : Services.wm.getMostRecentWindow('navigator:browser');

  async function importPdf(fileName, title) {
    const file = Zotero.isWin ? (fixturesDir + '/' + fileName).replace(/\//g, '\\') : fixturesDir + '/' + fileName;
    const item = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
    return item.id;
  }

  async function waitForManager(itemID, ms = 24000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const r = (Zotero.Reader._readers || []).find((x) => x.itemID === itemID);
      if (r && r._internalReader && r._internalReader._readAloudManager !== undefined) return r;
      await sleep(300);
    }
    throw new Error('reader/manager never appeared for item ' + itemID);
  }

  const out = { errors: [] };

  const aItemID = await importPdf('fixture-a.pdf', 'ZTTS highlight-levels Fixture A');
  const bItemID = await importPdf('fixture-b.pdf', 'ZTTS highlight-levels Fixture B');
  const epubItemID = params.epubItemID; // the standing "ZTTS Return-Key EPUB", never imported/erased here
  if (!Number.isInteger(epubItemID)) throw new Error('params.epubItemID missing: find "ZTTS Return-Key EPUB" with zotero_db_query and pass its itemID');

  await Zotero.Reader.open(aItemID);
  const readerA = await waitForManager(aItemID);
  win.Zotero_Tabs.select(readerA.tabID);
  readerA._internalReader.toggleReadAloudPopup(true);
  await sleep(400);
  let managerA = readerA._internalReader._readAloudManager;
  if (managerA && managerA.active && !managerA.paused) managerA.togglePaused();
  await sleep(150);

  await Zotero.Reader.open(epubItemID);
  const readerEpub = await waitForManager(epubItemID);
  win.Zotero_Tabs.select(readerEpub.tabID);
  readerEpub._internalReader.toggleReadAloudPopup(true);
  await sleep(400);
  let managerEpub = readerEpub._internalReader._readAloudManager;
  if (managerEpub && managerEpub.active && !managerEpub.paused) managerEpub.togglePaused();
  await sleep(150);

  // B: opened, never given a session -- the true idle reader
  await Zotero.Reader.open(bItemID);
  const readerB = await waitForManager(bItemID);

  managerA = readerA._internalReader._readAloudManager;
  managerEpub = readerEpub._internalReader._readAloudManager;
  const managerB = readerB._internalReader._readAloudManager;

  out.a = { itemID: aItemID, tabID: readerA.tabID, active: !!managerA?.active, paused: !!managerA?.paused, selectedVoiceID: managerA?.selectedVoiceID ?? null };
  out.epub = { itemID: epubItemID, tabID: readerEpub.tabID, active: !!managerEpub?.active, paused: !!managerEpub?.paused, selectedVoiceID: managerEpub?.selectedVoiceID ?? null };
  out.b = { itemID: bItemID, tabID: readerB.tabID, active: !!managerB?.active, paused: !!managerB?.paused };

  // Leave A selected, matching the case's "pane open on Highlight, fixture A playing/paused" setup to come
  win.Zotero_Tabs.select(readerA.tabID);

  Zotero.ZoteroTTSRun.state.fixtures = { a: out.a, b: out.b, epub: out.epub };

  return JSON.stringify(out, null, 1);
})();
