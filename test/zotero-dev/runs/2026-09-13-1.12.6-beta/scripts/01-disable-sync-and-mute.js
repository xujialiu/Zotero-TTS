return (async () => {
  const base = Zotero.__ztts97Baseline;
  if (!base?.prefs) throw new Error('baseline snapshot is missing');
  const prefix = 'extensions.zotero.zotero-tts.';
  const setBool = suffix => Services.prefs.setBoolPref(prefix + suffix, false);
  setBool('webdav.autoUploadSettings');
  setBool('webdav.syncSettings');
  setBool('webdav.syncPositions');
  Services.prefs.setIntPref(prefix + 'readAloud.volume', 0);
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
  const read = suffix => ({
    value: Zotero.Prefs.get('zotero-tts.' + suffix),
    user: Services.prefs.prefHasUserValue(prefix + suffix),
  });
  return JSON.stringify({
    syncPositions: read('webdav.syncPositions'),
    autoUploadSettings: read('webdav.autoUploadSettings'),
    syncSettings: read('webdav.syncSettings'),
    volume: read('readAloud.volume'),
    debugStoring: !!Zotero.Debug.storing,
  }, null, 1);
})()
