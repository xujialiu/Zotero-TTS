return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const keys = ['webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings', 'readAloud.volume'];
  const full = suffix => prefix + suffix;
  const read = suffix => {
    const name = full(suffix);
    const type = Services.prefs.getPrefType(name);
    let value = null;
    try {
      if (type === Services.prefs.PREF_BOOL) value = Services.prefs.getBoolPref(name);
      else if (type === Services.prefs.PREF_INT) value = Services.prefs.getIntPref(name);
      else if (type === Services.prefs.PREF_STRING) value = Services.prefs.getStringPref(name);
    } catch (e) {}
    return { value, user: Services.prefs.prefHasUserValue(name) };
  };
  const before = Object.fromEntries(keys.map(key => [key, read(key)]));
  Services.prefs.setBoolPref(full('webdav.syncPositions'), false);
  Services.prefs.setBoolPref(full('webdav.autoUploadSettings'), false);
  Services.prefs.setBoolPref(full('webdav.syncSettings'), false);
  Services.prefs.setIntPref(full('readAloud.volume'), 0);
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
  return JSON.stringify({
    before,
    during: Object.fromEntries(keys.map(key => [key, read(key)])),
    debugStoring: !!Zotero.Debug.storing,
  });
})()
