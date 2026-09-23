// Import the disposable PDF and EPUB fixtures and open both reader tabs,
// PDF selected. Waits for each reader's _internalReader/_readAloudManager
// and the reader document's toolbar/#split-view (workflow ceiling ~24s).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const importFixture = async (segments, title) => {
    const path = PathUtils.join(Zotero.ZoteroTTSRun.params.fixturesDir, ...segments);
    const item = await Zotero.Attachments.importFromFile({ file: path, libraryID: Zotero.Libraries.userLibraryID, title });
    return { itemID: item.id, key: item.key, title: item.getField('title') };
  };
  const pdfFixture = await importFixture(['fixture-a.pdf'], 'ztts-cover 2026-09-24 PDF');
  const epubFixture = await importFixture(['return-key', 'return-key.epub'], 'ztts-cover 2026-09-24 EPUB');
  Zotero.ZoteroTTSRun.state.fixtures = { pdf: pdfFixture, epub: epubFixture };

  const host = Zotero.getMainWindow();
  const openAndWait = async (itemID) => {
    await Zotero.Reader.open(itemID);
    let reader = null;
    for (const r of Zotero.Reader._readers || []) if (r.itemID === itemID) reader = r;
    if (!reader) throw new Error('reader did not open for ' + itemID);
    host.Zotero_Tabs.select(reader.tabID);
    let ready = false, waitedMs = 0;
    for (let i = 0; i < 48; i++) { // ~24s ceiling
      const doc = reader._iframeWindow && reader._iframeWindow.document;
      if (reader._internalReader && reader._internalReader._readAloudManager && doc && doc.querySelector('#split-view') && doc.querySelector('.toolbar')) { ready = true; break; }
      await sleep(500);
      waitedMs += 500;
    }
    return { reader, ready, waitedMs, tabID: reader.tabID };
  };

  const pdf = await openAndWait(pdfFixture.itemID);
  const epub = await openAndWait(epubFixture.itemID);
  // Leave the PDF tab selected (the player-closed reference state for item 1).
  host.Zotero_Tabs.select(pdf.reader.tabID);
  await sleep(150);

  Zotero.ZoteroTTSRun.state.tabs = { pdf: pdf.tabID, epub: epub.tabID };

  const describe = (r) => {
    const doc = r.reader._iframeWindow.document;
    return {
      ready: r.ready, waitedMs: r.waitedMs,
      hasSplitView: !!doc.querySelector('#split-view'),
      hasReactSplitView: !!doc.querySelector('#reader-ui .split-view'),
      hasToolbar: !!doc.querySelector('.toolbar'),
      hasToggle: !!doc.querySelector('#ztts-player-toggle'),
      layoutPref: Zotero.Prefs.get('zotero-tts.readAloud.playerLayout'),
    };
  };

  return JSON.stringify({
    posBeforeRows: Zotero.ZoteroTTSRun.state.posBeforeRows,
    pdfFixture, epubFixture,
    pdf: describe(pdf), epub: describe(epub),
    selectedTab: host.Zotero_Tabs.selectedID,
  }, null, 1);
})();
