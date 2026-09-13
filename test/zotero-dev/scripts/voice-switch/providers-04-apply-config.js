return (() => {
  const state = Zotero.__zttsAllHandoff;
  const base = state && state.baseline;
  const mode = state && state.requestedMode;
  if (!base || !base.prefs || !mode) throw new Error('baseline or requested mode is missing');
  const prefix = 'extensions.zotero.zotero-tts.';
  const restore = (name, entry) => {
    if (!entry) return;
    if (!entry.user) { if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name); return; }
    if (typeof entry.value === 'boolean') Services.prefs.setBoolPref(name, entry.value);
    else if (Number.isInteger(entry.value)) Services.prefs.setIntPref(name, entry.value);
    else if (typeof entry.value === 'string') Services.prefs.setStringPref(name, entry.value);
  };
  const basePref = suffix => base.prefs[suffix];
  for (const suffix of Object.keys(base.prefs)) {
    if (suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices' || suffix === 'webdav.syncPositions' || suffix === 'webdav.autoUploadSettings' || suffix === 'webdav.syncSettings') continue;
    restore(prefix + suffix, basePref(suffix));
  }
  const enable = { openai: false, azure: false, cloudflare: false, speechify: false, fish: false, fishspeech: false, local: false, system: false };
  if (mode === 'all-configured') Object.assign(enable, { openai: true, azure: true, speechify: true, fish: true, fishspeech: true, local: true, system: true });
  if (mode === 'chatterbox-fish') {
    enable.openai = true; enable.fish = true;
    let stored = null;
    try { stored = JSON.parse(basePref('openai.presetValues').value || ''); } catch (e) {}
    const c = stored && stored.chatterbox;
    if (!c || typeof c !== 'object') throw new Error('saved Chatterbox preset is missing');
    for (const field of ['baseURL', 'model', 'apiKey', 'voices', 'headers']) if (typeof c[field] === 'string') Services.prefs.setStringPref(prefix + 'openai.' + field, c[field]);
    Services.prefs.setStringPref(prefix + 'openai.server', 'chatterbox');
  }
  for (const [id, on] of Object.entries(enable)) Services.prefs.setBoolPref(prefix + id + '.enabled', on);
  Services.prefs.setBoolPref(prefix + 'webdav.syncPositions', false);
  Services.prefs.setBoolPref(prefix + 'webdav.autoUploadSettings', false);
  Services.prefs.setBoolPref(prefix + 'webdav.syncSettings', false);
  Services.prefs.setBoolPref(prefix + 'readAloud.sameForAllDocuments', false);
  Services.prefs.setIntPref(prefix + 'readAloud.volume', 0);
  const summary = {};
  for (const id of Object.keys(enable)) summary[id] = Zotero.Prefs.get('zotero-tts.' + id + '.enabled');
  summary.openaiServer = Zotero.Prefs.get('zotero-tts.openai.server');
  summary.openaiBaseURL = Zotero.Prefs.get('zotero-tts.openai.baseURL');
  summary.openaiModel = Zotero.Prefs.get('zotero-tts.openai.model');
  summary.openaiApiKey = { set: !!Zotero.Prefs.get('zotero-tts.openai.apiKey'), chars: String(Zotero.Prefs.get('zotero-tts.openai.apiKey') || '').length };
  summary.openaiHeaders = { set: !!Zotero.Prefs.get('zotero-tts.openai.headers'), chars: String(Zotero.Prefs.get('zotero-tts.openai.headers') || '').length };
  return JSON.stringify({ mode, enabled: summary }, null, 1);
})()
