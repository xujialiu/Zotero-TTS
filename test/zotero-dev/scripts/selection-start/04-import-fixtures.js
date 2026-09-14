return (async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const state = Zotero.ZoteroTTSRun.state;
  const stamp = Date.now();
  const root = { stamp, pdf: { itemID: null, key: null, title: `Zotero-TTS selection-start PDF ${stamp}`, reader: null }, epub: { itemID: null, key: null, title: `Zotero-TTS selection-start EPUB ${stamp}`, reader: null } };
  const importOne = async (slot, path) => {
    const imported = await Zotero.Attachments.importFromFile({ file: path, libraryID: Zotero.Libraries.userLibraryID, title: slot.title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error(slot.title + ' import returned no item');
    slot.itemID = item.id;
    slot.key = item.key;
  };
  const fixtureDir = String(p.fixturesDir).replace(/\//g, '\\');
  await importOne(root.pdf, PathUtils.join(fixtureDir, 'fixture-a.pdf'));
  await importOne(root.epub, PathUtils.join(fixtureDir, 'return-key', 'return-key.epub'));
  state.fixtures = root;
  return JSON.stringify({ stamp, pdf: { itemID: root.pdf.itemID, key: root.pdf.key, title: root.pdf.title }, epub: { itemID: root.epub.itemID, key: root.epub.key, title: root.epub.title } });
})()
