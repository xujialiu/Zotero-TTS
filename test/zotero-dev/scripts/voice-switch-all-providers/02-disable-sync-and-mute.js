return (() => {
  const p = 'extensions.zotero.zotero-tts.';
  Services.prefs.setBoolPref(p + 'webdav.syncPositions', false);
  Services.prefs.setBoolPref(p + 'webdav.autoUploadSettings', false);
  Services.prefs.setBoolPref(p + 'webdav.syncSettings', false);
  Services.prefs.setBoolPref(p + 'readAloud.sameForAllDocuments', false);
  Services.prefs.setIntPref(p + 'readAloud.volume', 0);
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
  const read = suffix => ({ value: Zotero.Prefs.get('zotero-tts.' + suffix), user: Services.prefs.prefHasUserValue(p + suffix) });
  return JSON.stringify({ syncPositions: read('webdav.syncPositions'), autoUploadSettings: read('webdav.autoUploadSettings'), syncSettings: read('webdav.syncSettings'), sameForAllDocuments: read('readAloud.sameForAllDocuments'), volume: read('readAloud.volume'), debugStoring: !!Zotero.Debug.storing }, null, 1);
})()
