(() => {
  const set = (suffix, value) => Zotero.Prefs.set('zotero-tts.' + suffix, value);
  set('webdav.syncPositions', false);
  set('webdav.syncSettings', false);
  set('webdav.autoUploadSettings', false);
  set('readAloud.volume', 0);
  set('readAloud.stripAngleBrackets', true);
  set('readAloud.bracketPairs', '<> []');
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
  const read = suffix => ({
    value: Zotero.Prefs.get('zotero-tts.' + suffix),
    user: Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.' + suffix),
  });
  return JSON.stringify({
    syncPositions: read('webdav.syncPositions'),
    syncSettings: read('webdav.syncSettings'),
    autoUploadSettings: read('webdav.autoUploadSettings'),
    volume: read('readAloud.volume'),
    stripAngleBrackets: read('readAloud.stripAngleBrackets'),
    bracketPairs: read('readAloud.bracketPairs'),
    debugStoring: !!Zotero.Debug.storing,
  }, null, 1);
})()
