return (async () => {
  const stamp = Date.now();
  const root = {
    version: 'issue-100-live-beta2',
    createdAt: stamp,
    pdf: { itemID: null, key: null, title: 'Zotero-TTS issue 100 PDF fixture ' + stamp, reader: null },
    epub: { itemID: null, key: null, title: 'Zotero-TTS issue 100 EPUB fixture ' + stamp, reader: null },
  };
  const importOne = async (slot, file) => {
    const imported = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title: slot.title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error(slot.title + ' import returned no item');
    slot.itemID = item.id;
    slot.key = item.key;
    return { itemID: item.id, key: item.key, title: slot.title };
  };
  await importOne(root.pdf, 'C:\\Users\\xujia\\orca\\workspaces\\zotero_plugin_tts\\scroll\\test\\fixtures\\fixture-a.pdf');
  await importOne(root.epub, 'C:\\Users\\xujia\\orca\\workspaces\\zotero_plugin_tts\\scroll\\test\\fixtures\\return-key\\return-key.epub');
  Zotero.__ztts100 = root;
  return JSON.stringify({ version: root.version, createdAt: stamp, pdf: { itemID: root.pdf.itemID, key: root.pdf.key, title: root.pdf.title }, epub: { itemID: root.epub.itemID, key: root.epub.key, title: root.epub.title } });
})()
