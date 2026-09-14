return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const read = suffix => {
    const name = prefix + suffix;
    const type = p.getPrefType(name);
    const user = p.prefHasUserValue(name);
    let value = null;
    try {
      if (type === p.PREF_BOOL) value = p.getBoolPref(name);
      else if (type === p.PREF_INT) value = p.getIntPref(name);
    } catch (e) {}
    return { type, user, value };
  };
  const before = {};
  for (const suffix of ['readAloud.volume', 'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings']) before[suffix] = read(suffix);
  p.setBoolPref(prefix + 'webdav.syncPositions', false);
  p.setBoolPref(prefix + 'webdav.autoUploadSettings', false);
  p.setBoolPref(prefix + 'webdav.syncSettings', false);
  p.setIntPref(prefix + 'readAloud.volume', 0);
  state.testPrefs = { before };
  const during = {};
  for (const suffix of Object.keys(before)) during[suffix] = read(suffix);
  return JSON.stringify({ before: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, { type: v.type, user: v.user, value: k === 'readAloud.volume' ? v.value : v.value }])), during, debugStoring: !!Zotero.Debug?.storing });
})()
