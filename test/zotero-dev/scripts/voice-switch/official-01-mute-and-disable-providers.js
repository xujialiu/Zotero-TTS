return (() => {
  const state = Zotero.__zttsOfficialFollowup;
  if (!state || !state.baseline) throw new Error('baseline script has not run');
  const p = 'extensions.zotero.zotero-tts.';
  const providerIDs = ['openai', 'azure', 'cloudflare', 'speechify', 'fish', 'fishspeech', 'local', 'system'];
  for (const id of providerIDs) Services.prefs.setBoolPref(p + id + '.enabled', false);
  Services.prefs.setBoolPref(p + 'webdav.syncPositions', false);
  Services.prefs.setBoolPref(p + 'webdav.autoUploadSettings', false);
  Services.prefs.setBoolPref(p + 'webdav.syncSettings', false);
  Services.prefs.setBoolPref(p + 'readAloud.sameForAllDocuments', false);
  Services.prefs.setIntPref(p + 'readAloud.volume', 0);
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
  const read = suffix => ({ value: Zotero.Prefs.get('zotero-tts.' + suffix), user: Services.prefs.prefHasUserValue(p + suffix) });
  const enabled = {};
  for (const id of providerIDs) enabled[id] = read(id + '.enabled');
  return JSON.stringify({ enabled, syncPositions: read('webdav.syncPositions'), autoUploadSettings: read('webdav.autoUploadSettings'), syncSettings: read('webdav.syncSettings'), sameForAllDocuments: read('readAloud.sameForAllDocuments'), volume: read('readAloud.volume'), debugStoring: !!Zotero.Debug.storing }, null, 1);
})()
