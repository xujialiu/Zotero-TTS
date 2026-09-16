(async () => {
  const p = Zotero.ZoteroTTSRun.params || {};
  const state = Zotero.ZoteroTTSRun.state;
  const join = (a, b) => String(a).replace(/[\\/]$/, '') + (Zotero.isWin ? '\\' : '/') + String(b).split('/').join(Zotero.isWin ? '\\' : '/');
  const rawDir = p.fixturesDir || join(p.root || '', 'test/fixtures');
  const dir = Zotero.isWin ? String(rawDir).split('/').join('\\') : rawDir;
  const run = String(p.runId || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_');
  const importOne = async (path, title) => {
    const imported = await Zotero.Attachments.importFromFile({ file: path, libraryID: Zotero.Libraries.userLibraryID, title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    return { id: item?.id ?? null, key: item?.key ?? null, title: item?.getField?.('title') || title };
  };
  const pdf = await importOne(join(dir, 'fixture-a.pdf'), 'Zotero-TTS plugin-player PDF ' + run);
  const epub = await importOne(join(dir, 'return-key/return-key.epub'), 'Zotero-TTS plugin-player EPUB ' + run);
  const waitReader = async id => {
    for (let i = 0; i < 120; i++) {
      const list = Zotero.Reader?._readers || [];
      for (let j = 0; j < list.length; j++) {
        const r = list[j];
        if (r?.itemID === id && r._internalReader?._readAloudManager) return r;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  };
  const opened = Zotero.Reader.open(pdf.id);
  if (opened && typeof opened.then === 'function') await opened;
  const reader = await waitReader(pdf.id);
  if (!reader) throw new Error('PDF reader did not expose _internalReader/_readAloudManager');
  state.fixtures = { pdf, epub, pdfOpened: true };
  return JSON.stringify({ pdf, epub, pdfReader: { itemID: reader.itemID, internal: !!reader._internalReader, manager: !!reader._internalReader?._readAloudManager }, fixtureDir: dir }, null, 1);
})()
