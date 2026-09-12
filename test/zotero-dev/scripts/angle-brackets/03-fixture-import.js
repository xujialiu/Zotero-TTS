(async () => {
  const file = 'C:\\Users\\xujia\\orca\\workspaces\\zotero_plugin_tts\\angle\\test\\fixtures\\angle-brackets\\angle-brackets.epub';
  try {
    const imported = await Zotero.Attachments.importFromFile({
      file,
      libraryID: Zotero.Libraries.userLibraryID,
      title: 'Zotero-TTS issue 94 angle brackets'
    });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    return JSON.stringify({
      importedType: typeof imported,
      itemID: item?.id ?? imported?.id ?? imported ?? null,
      key: item?.key ?? null,
      title: item?.getField ? item.getField('title') : null,
      itemType: item?.getItemTypeIconName ? item.getItemTypeIconName() : null
    }, null, 1);
  } catch (e) {
    return JSON.stringify({error:String(e), stack:e?.stack||null});
  }
})()
