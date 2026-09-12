(() => {
  const set = (suffix, value) => Zotero.Prefs.set('zotero-tts.' + suffix, value);
  set('webdav.syncPositions', false);
  set('webdav.syncSettings', false);
  set('webdav.autoUploadSettings', false);
  set('readAloud.volume', 0);
  set('readAloud.stripAngleBrackets', true);
  const full = (s) => 'extensions.zotero.zotero-tts.' + s;
  const read = (s) => ({value: Zotero.Prefs.get('zotero-tts.' + s), user: Services.prefs.prefHasUserValue(full(s))});
  return JSON.stringify({
    syncPositions: read('webdav.syncPositions'),
    syncSettings: read('webdav.syncSettings'),
    autoUploadSettings: read('webdav.autoUploadSettings'),
    volume: read('readAloud.volume'),
    stripAngleBrackets: read('readAloud.stripAngleBrackets')
  }, null, 1);
})()
