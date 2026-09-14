return (async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const fixtureDir = String(run.params.fixturesDir || '').replace(/\//g, '\\');
  const stamp = Date.now();
  const fixtures = {
    pdf: { title: `Zotero-TTS issue 107 PDF ${stamp}`, itemID: null, key: null, reader: null },
    epubScrolled: { title: `Zotero-TTS issue 107 EPUB scrolled ${stamp}`, itemID: null, key: null, reader: null },
    epubPaginated: { title: `Zotero-TTS issue 107 EPUB paginated ${stamp}`, itemID: null, key: null, reader: null },
  };
  const files = {
    pdf: PathUtils.join(fixtureDir, 'fixture-a.pdf'),
    epubScrolled: PathUtils.join(fixtureDir, 'return-key', 'return-key.epub'),
    epubPaginated: PathUtils.join(fixtureDir, 'return-key', 'return-key.epub'),
  };
  const out = [];
  for (const kind of Object.keys(fixtures)) {
    const slot = fixtures[kind];
    try {
      const imported = await Zotero.Attachments.importFromFile({ file: files[kind], libraryID: Zotero.Libraries.userLibraryID, title: slot.title });
      const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
      if (!item?.id) throw new Error('import returned no item');
      slot.itemID = item.id; slot.key = item.key;
      out.push({ kind, itemID: slot.itemID, key: slot.key, title: slot.title });
    } catch (e) { out.push({ kind, error: String(e), title: slot.title }); }
  }
  state.fixtures = fixtures;
  return JSON.stringify({ stamp, fixtureDirChars: fixtureDir.length, out });
})()
