(async () => {
  const set = (suffix, value) => Zotero.Prefs.set('zotero-tts.' + suffix, value);
  set('webdav.syncPositions', false);
  set('webdav.syncSettings', false);
  set('webdav.autoUploadSettings', false);
  set('readAloud.volume', 0);
  set('readAloud.stripAngleBrackets', true);
  set('readAloud.bracketPairs', '<> []');
  set('fish.enabled', true);
  set('fish.freeOnly', true);
  set('prefetchEnabled', false);
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
  const read = suffix => ({
    value: Zotero.Prefs.get('zotero-tts.' + suffix),
    user: Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.' + suffix),
  });
  const params = Zotero.ZoteroTTSRun.params;
  const file = Zotero.isWin
    ? params.fixturesDir.replace(/\//g, '\\') + '\\angle-brackets\\angle-brackets.epub'
    : params.fixturesDir + '/angle-brackets/angle-brackets.epub';
  let imported = null, error = null, item = null;
  try {
    imported = await Zotero.Attachments.importFromFile({
      file,
      libraryID: Zotero.Libraries.userLibraryID,
      title: 'Zotero-TTS issue 127 brackets inside a sentence',
    });
    item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    Zotero.ZoteroTTSRun.state.fixtureItemID = item?.id ?? imported?.id ?? imported ?? null;
  } catch (e) { error = String(e) + (e && e.stack ? ('\n' + e.stack) : ''); }
  return JSON.stringify({
    syncPositions: read('webdav.syncPositions'),
    syncSettings: read('webdav.syncSettings'),
    autoUploadSettings: read('webdav.autoUploadSettings'),
    volume: read('readAloud.volume'),
    stripAngleBrackets: read('readAloud.stripAngleBrackets'),
    bracketPairs: read('readAloud.bracketPairs'),
    fishEnabled: read('fish.enabled'),
    fishFreeOnly: read('fish.freeOnly'),
    prefetchEnabled: read('prefetchEnabled'),
    debugStoring: !!Zotero.Debug.storing,
    file,
    fixtureItemID: Zotero.ZoteroTTSRun.state.fixtureItemID,
    key: item?.key ?? null,
    title: item?.getField ? item.getField('title') : null,
    itemType: item?.getItemTypeIconName ? item.getItemTypeIconName() : null,
    error,
  }, null, 1);
})()
