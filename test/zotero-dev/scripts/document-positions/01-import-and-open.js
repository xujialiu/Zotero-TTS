/**
 * The run's own EPUB into the library and open, with the rulebook's poll for
 * `_internalReader` and `_readAloudManager` after an in-place install.
 * params: fixturePath, fixtureTitle. state: fixture { itemID, lib, key, tabID }.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const out = { steps: [] };
  const item = await Zotero.Attachments.importFromFile({
    file: p.fixturePath,
    libraryID: Zotero.Libraries.userLibraryID,
    title: p.fixtureTitle,
  });
  out.itemID = item.id;
  out.lib = item.libraryID;
  out.key = item.key;
  out.contentType = item.attachmentContentType;
  out.storedPath = await item.getFilePathAsync();
  const reader = await Zotero.Reader.open(item.id);
  out.opened = !!reader;
  // ≤7 s polls, a ~24 s ceiling (agents/zotero-tester.md, "How to drive" 2)
  const started = Date.now();
  let internal = null;
  let manager = null;
  while (Date.now() - started < 24000) {
    internal = reader?._internalReader ?? null;
    manager = internal?._readAloudManager ?? null;
    out.steps.push(`${Date.now() - started} ms internal=${!!internal} manager=${!!manager}`);
    if (internal && manager) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  out.ready = !!(internal && manager);
  out.waitedMs = Date.now() - started;
  out.tabID = reader?.tabID ?? null;
  out.type = reader?.type ?? null;
  Zotero.ZoteroTTSRun.state.fixture = { itemID: item.id, lib: item.libraryID, key: item.key, tabID: out.tabID };
  return JSON.stringify(out);
})()
