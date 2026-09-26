(async () => {
  const session = Zotero.__ztts149;
  if (!session?.baseline || !session.destinationMatched) throw new Error('149 isolation baseline is missing');
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const fixturesDir = Zotero.ZoteroTTSRun.params.fixturesDir;
  const readBool = suffix => p.getBoolPref(prefix + suffix);
  p.setIntPref(prefix + 'readAloud.volume', 0);
  p.setBoolPref(prefix + 'readAloud.sameForAllDocuments', false);
  for (const suffix of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) p.setBoolPref(prefix + suffix, false);
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);

  const specs = [
    { kind: 'pdf', file: PathUtils.join(fixturesDir, 'fixture-a.pdf') },
    { kind: 'epub', file: PathUtils.join(fixturesDir, 'return-key', 'return-key.epub') },
  ];
  const fixtures = [];
  for (const spec of specs) {
    const title = `Zotero-TTS issue 149 ${spec.kind} ${Date.now()}`;
    const imported = await Zotero.Attachments.importFromFile({ file: spec.file, libraryID: Zotero.Libraries.userLibraryID, title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error(`${spec.kind} fixture import returned no item`);
    fixtures.push({ kind: spec.kind, itemID: item.id, key: item.key, title });
  }
  session.fixtures = fixtures;
  Zotero.ZoteroTTSRun.state.fixtures149 = fixtures;
  return JSON.stringify({
    status: 'PASS',
    fixtures,
    volume: p.getIntPref(prefix + 'readAloud.volume'),
    sameForAllDocuments: p.getBoolPref(prefix + 'readAloud.sameForAllDocuments'),
    sync: {
      positions: readBool('webdav.syncPositions'),
      settings: readBool('webdav.syncSettings'),
      autoUpload: readBool('webdav.autoUploadSettings'),
    },
    debugStoring: !!Zotero.Debug.storing,
  }, null, 1);
})();
