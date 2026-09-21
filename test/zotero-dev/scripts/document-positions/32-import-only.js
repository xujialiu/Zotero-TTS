/**
 * Import an EPUB fixture WITHOUT opening its reader. Item 13 needs its
 * phone item written into the file before the tab ever opens — naming
 * happens only when the reader opens (issue #129) — so nothing here may
 * touch Zotero.Reader.
 * params: fixturePath, fixtureTitle, stateKey (where { itemID, lib, key,
 * tabID: null } is left, e.g. state.fixture13).
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const out = {};
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
  const rec = { itemID: item.id, lib: item.libraryID, key: item.key, tabID: null };
  Zotero.ZoteroTTSRun.state[p.stateKey || 'importedFixture'] = rec;
  // Confirms the import alone does not name the document (issue #129: only
  // a reader open does), so a later open's "document named on open" is
  // this run's own first sighting of the id, not a leftover from import.
  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.documentsAfterImport = sync.shared.documents;
  return JSON.stringify(out);
})()
