return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const names = [
    'openai.enabled', 'openai.server', 'openai.baseURL', 'openai.model', 'openai.voice', 'openai.voices', 'openai.apiKey', 'openai.headers', 'openai.presetValues',
    'azure.enabled', 'azure.apiKey', 'azure.region', 'azure.voice',
    'cloudflare.enabled', 'cloudflare.accountId', 'cloudflare.apiToken',
    'speechify.enabled', 'speechify.apiKey',
    'fish.enabled', 'fish.apiKey', 'fish.freeOnly', 'fish.voices', 'fish.includeOfficial', 'fish.includeOwn', 'fish.includeManual',
    'fishspeech.enabled', 'fishspeech.baseURL', 'fishspeech.headers',
    'local.enabled', 'local.engine', 'local.baseURL', 'local.voice', 'local.headers',
    'system.enabled', 'readAloud.volume', 'readAloud.sameForAllDocuments', 'readAloud.memory',
    'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings', 'prefetch', 'prefetchEnabled',
  ];
  const read = suffix => {
    const name = prefix + suffix;
    let value = null;
    try { value = Zotero.Prefs.get('zotero-tts.' + suffix); } catch (e) {}
    return { value, user: Services.prefs.prefHasUserValue(name) };
  };
  const prefs = {};
  for (const suffix of names) prefs[suffix] = read(suffix);
  const nativeName = 'extensions.zotero.reader.readAloudVoices';
  let nativeValue = null;
  try { nativeValue = Zotero.Prefs.get('reader.readAloudVoices'); } catch (e) {}
  prefs['reader.readAloudVoices'] = { value: nativeValue, user: Services.prefs.prefHasUserValue(nativeName) };
  const readers = [];
  const list = Zotero.Reader._readers || [];
  for (let i = 0; i < list.length; i++) {
    const reader = list[i];
    const manager = reader && reader._internalReader && reader._internalReader._readAloudManager;
    const controller = manager && manager._controller;
    let title = null;
    try { const item = Zotero.Items.get(reader.itemID); title = (item.parentItem || item).getField('title'); } catch (e) {}
    readers.push({ index: i, itemID: reader.itemID, tabID: reader.tabID, title, active: !!(manager && manager.active), paused: manager ? !!manager.paused : null, popupOpen: !!(reader._internalReader && reader._internalReader._state && reader._internalReader._state.readAloudState && reader._internalReader._state.readAloudState.popupOpen), selected: manager && manager.selectedVoiceID || null, tier: manager && manager._selectedTier || null, position: controller && Number.isFinite(controller._position) ? controller._position : null, currentIndex: controller && Number.isFinite(controller._currentIndex) ? controller._currentIndex : null, audioState: controller && controller._audioContext && controller._audioContext.state || null, audioTime: controller && controller._audioContext && Number.isFinite(controller._audioContext.currentTime) ? controller._audioContext.currentTime : null });
  }
  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { position = { error: String(e) }; }
  const main = Zotero.getMainWindow && Zotero.getMainWindow();
  const baseline = { prefs, readers, main: { selectedID: main && main.Zotero_Tabs && main.Zotero_Tabs.selectedID || null, selectedIndex: main && main.Zotero_Tabs && main.Zotero_Tabs.selectedIndex || null }, debugStoring: !!Zotero.Debug.storing, position };
  Zotero.__zttsAllHandoff = { baseline, requestedMode: null, spec: null, fixture: null, run: null, results: [] };
  const redacted = {};
  for (const [suffix, entry] of Object.entries(prefs)) {
    const secret = /apiKey|apiToken|headers|memory|presetValues|reader\.readAloudVoices/i.test(suffix);
    redacted[suffix] = secret ? { set: typeof entry.value === 'string' && entry.value.length > 0, chars: typeof entry.value === 'string' ? entry.value.length : null, user: entry.user } : { value: entry.value, user: entry.user };
  }
  return JSON.stringify({ stored: true, zoteroVersion: Zotero.version, platform: Services.appinfo.OS, readers, main: baseline.main, debugStoring: baseline.debugStoring, prefs: redacted, position: { rows: position && position.database && position.database.rows || null, queued: position && position.store && position.store.queued || null, lastError: position && position.store && position.store.lastError || null } }, null, 1);
})()
