return (async () => {
  const fixturesDir = Zotero.ZoteroTTSRun.params.fixturesDir;
  const file = PathUtils.join(fixturesDir, 'fixture-a.pdf');
  const title = 'Zotero-TTS issue 95 voice-switch fixture ' + Date.now();
  try {
    const imported = await Zotero.Attachments.importFromFile({
      file,
      libraryID: Zotero.Libraries.userLibraryID,
      title,
    });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error('fixture import returned no item');
    Zotero.__ztts95Fixture = { itemID: item.id, key: item.key, title };
    return JSON.stringify({
      importedType: typeof imported,
      itemID: item.id,
      key: item.key,
      title,
      itemType: item.getItemTypeIconName?.() ?? null,
    }, null, 1);
  } catch (e) {
    return JSON.stringify({ error: String(e), stack: e?.stack ?? null }, null, 1);
  }
})()
