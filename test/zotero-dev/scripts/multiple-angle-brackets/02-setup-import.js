(async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const fixturePath = 'C:\\Users\\xujia\\orca\\workspaces\\zotero_plugin_tts\\issue_94_2\\test\\fixtures\\angle-brackets\\angle-brackets.epub';
  const set = (suffix, value) => Zotero.Prefs.set('zotero-tts.' + suffix, value);
  set('webdav.syncPositions', false);
  set('webdav.syncSettings', false);
  set('webdav.autoUploadSettings', false);
  set('readAloud.volume', 0);
  set('readAloud.stripAngleBrackets', true);
  const imported = await Zotero.Attachments.importFromFile({
    file: fixturePath,
    libraryID: Zotero.Libraries.userLibraryID,
    title: 'Zotero-TTS issue 96 angle brackets',
  });
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  const read = suffix => ({
    value: Zotero.Prefs.get('zotero-tts.' + suffix),
    user: Services.prefs.prefHasUserValue(prefix + suffix),
  });
  return JSON.stringify({
    itemID: item?.id ?? null,
    key: item?.key ?? null,
    title: item?.getField ? item.getField('title') : null,
    prefs: {
      stripAngleBrackets: read('readAloud.stripAngleBrackets'),
      volume: read('readAloud.volume'),
      syncPositions: read('webdav.syncPositions'),
      syncSettings: read('webdav.syncSettings'),
      autoUploadSettings: read('webdav.autoUploadSettings'),
    },
  }, null, 1);
})()
