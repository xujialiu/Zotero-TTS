return (async () => {
  const file = 'C:\\Users\\xujia\\orca\\workspaces\\zotero_plugin_tts\\shortcut_swtich_voice\\test\\fixtures\\fixture-b.pdf';
  const title = 'Zotero-TTS issue 95 voice-switch second fixture ' + Date.now();
  const imported = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  if (!item?.id) throw new Error('second fixture import returned no item');
  Zotero.__ztts95FixtureB = { itemID: item.id, key: item.key, title };
  return JSON.stringify({ itemID: item.id, key: item.key, title, itemType: item.getItemTypeIconName?.() ?? null }, null, 1);
})()
