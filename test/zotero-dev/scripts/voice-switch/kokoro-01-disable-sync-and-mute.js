return (() => {
  const base = Zotero.__ztts95Kokoro;
  if (!base?.prefs) throw new Error('baseline snapshot is missing');
  const p = 'extensions.zotero.zotero-tts.';
  Services.prefs.setBoolPref(p + 'webdav.syncPositions', false);
  Services.prefs.setBoolPref(p + 'webdav.autoUploadSettings', false);
  Services.prefs.setBoolPref(p + 'webdav.syncSettings', false);
  Services.prefs.setBoolPref(p + 'readAloud.sameForAllDocuments', false);
  Services.prefs.setIntPref(p + 'readAloud.volume', 0);
  // The configured Kokoro server is authorized for this bounded real check;
  // cleanup restores the exact original enabled flag from the baseline.
  Services.prefs.setBoolPref(p + 'local.enabled', true);
  Services.prefs.setStringPref(p + 'readAloud.memory', JSON.stringify({ speed: 1, voice: { id: 'local::af_bella', lang: 'en' } }));
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
  const read = suffix => ({ value: Zotero.Prefs.get('zotero-tts.' + suffix), user: Services.prefs.prefHasUserValue(p + suffix) });
  return JSON.stringify({ syncPositions: read('webdav.syncPositions'), autoUploadSettings: read('webdav.autoUploadSettings'),
    syncSettings: read('webdav.syncSettings'), sameForAllDocuments: read('readAloud.sameForAllDocuments'),
    volume: read('readAloud.volume'), debugStoring: !!Zotero.Debug.storing }, null, 1);
})()
