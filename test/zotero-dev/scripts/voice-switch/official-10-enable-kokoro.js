return (() => {
  const state = Zotero.__zttsOfficialFollowup;
  if (!state || !state.baseline) throw new Error('baseline missing');
  const p = 'extensions.zotero.zotero-tts.';
  Services.prefs.setBoolPref(p + 'local.enabled', true);
  Services.prefs.setBoolPref(p + 'webdav.syncPositions', false);
  Services.prefs.setBoolPref(p + 'webdav.autoUploadSettings', false);
  Services.prefs.setBoolPref(p + 'webdav.syncSettings', false);
  Services.prefs.setBoolPref(p + 'readAloud.sameForAllDocuments', false);
  Services.prefs.setIntPref(p + 'readAloud.volume', 0);
  state.localMode = { enabled: true, engine: Zotero.Prefs.get('zotero-tts.local.engine'), baseURL: String(Zotero.Prefs.get('zotero-tts.local.baseURL') || '').replace(/\/[^/]*$/, '/configured') };
  return JSON.stringify({ local: { enabled: Zotero.Prefs.get('zotero-tts.local.enabled'), engine: state.localMode.engine, endpointConfigured: !!Zotero.Prefs.get('zotero-tts.local.baseURL') }, volume: Zotero.Prefs.get('zotero-tts.readAloud.volume'), syncPositions: Zotero.Prefs.get('zotero-tts.webdav.syncPositions') }, null, 1);
})()
