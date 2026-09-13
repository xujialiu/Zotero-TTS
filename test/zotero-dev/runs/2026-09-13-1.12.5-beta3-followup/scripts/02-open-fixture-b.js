return (async () => {
  const root = Zotero.__ztts95Followup;
  if (!root) throw new Error('follow-up setup is missing');
  const fixture = root.fixtures.b;
  const file = 'C:\\Users\\xujia\\orca\\workspaces\\zotero_plugin_tts\\shortcut_swtich_voice\\test\\fixtures\\fixture-b.pdf';
  const title = 'Zotero-TTS issue 95 follow-up fixture B ' + Date.now();
  const imported = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  if (!item?.id) throw new Error('fixture B import returned no item');
  fixture.itemID = item.id;
  fixture.key = item.key;
  fixture.title = title;
  const opened = await root.openFixture(fixture, true);
  return JSON.stringify({ fixture: 'b', itemID: item.id, key: item.key, title, opened, state: root.read(fixture) }, null, 1);
})()
