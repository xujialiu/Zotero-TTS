return (async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const dir = String(p.fixturesDir);
  const specs = [
    { kind: 'pdf', file: PathUtils.join(dir, 'fixture-a.pdf') },
    { kind: 'epub', file: PathUtils.join(dir, 'return-key', 'return-key.epub') },
  ];
  const fixtures = [];
  for (const spec of specs) {
    const title = `Zotero-TTS issue 106 ${spec.kind} ${Date.now()}`;
    const imported = await Zotero.Attachments.importFromFile({ file: spec.file, libraryID: Zotero.Libraries.userLibraryID, title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error(`${spec.kind} fixture import returned no item`);
    fixtures.push({ kind: spec.kind, itemID: item.id, key: item.key, title, file: spec.file });
  }
  Zotero.ZoteroTTSRun.state.fixtures = fixtures;
  return JSON.stringify({ fixtures: fixtures.map(({ file, ...rest }) => rest) }, null, 1);
})()
