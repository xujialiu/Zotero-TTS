return (async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const p = run.params;
  const prefix = 'extensions.zotero.zotero-tts.';
  const pluginKeys = [
    'readAloud.volume', 'readAloud.sameForAllDocuments', 'readAloud.globalSpeed',
    'readAloud.favoriteVoices', 'readAloud.favoritesOnly', 'readAloud.sentenceDelayEnabled',
    'readAloud.sentenceDelayMs', 'readAloud.paragraphDelayEnabled', 'readAloud.paragraphDelayMs',
    'shortcuts.previousVoice', 'shortcuts.nextVoice', 'webdav.syncPositions',
    'webdav.autoUploadSettings', 'webdav.syncSettings', 'readAloud.memory',
    'openai.enabled', 'azure.enabled', 'cloudflare.enabled', 'speechify.enabled',
    'fish.enabled', 'fishspeech.enabled', 'local.enabled', 'system.enabled',
    'local.engine', 'local.baseURL', 'local.voice', 'local.headers',
    'highlight.sentence', 'highlight.word',
  ];
  const full = suffix => suffix === 'reader.readAloudVoices'
    ? 'extensions.zotero.reader.readAloudVoices' : prefix + suffix;
  const read = suffix => {
    const name = full(suffix);
    let value = null;
    try { value = Zotero.Prefs.get(name.replace(/^extensions\.zotero\./, '')); } catch (e) {}
    return { value, user: Services.prefs.prefHasUserValue(name) };
  };
  const prefs = {};
  for (const key of pluginKeys) prefs[key] = read(key);
  prefs['reader.readAloudVoices'] = read('reader.readAloudVoices');
  const readers = [];
  const list = Zotero.Reader._readers || [];
  for (let i = 0; i < list.length; i++) {
    const reader = list[i];
    const manager = reader?._internalReader?._readAloudManager;
    let title = null;
    try {
      const item = Zotero.Items.get(reader.itemID);
      const parent = item?.parentItem ? Zotero.Items.get(item.parentItem) : item;
      title = parent?.getField('title') ?? null;
    } catch (e) {}
    readers.push({ itemID: reader.itemID, tabID: reader.tabID, title,
      active: !!manager?.active, paused: manager?.paused ?? null,
      popupOpen: !!reader?._internalReader?._state?.readAloudState?.popupOpen,
      voice: manager?.selectedVoiceID ?? null, tier: manager?._selectedTier ?? null,
      position: Number.isFinite(manager?._controller?._position) ? manager._controller._position : null });
  }
  state.baseline = {
    prefs,
    readers,
    selectedTabID: Zotero.getMainWindow?.()?.Zotero_Tabs?.selectedID ?? null,
    debugStoring: !!Zotero.Debug.storing,
    settingsWindowOpen: !!Services.wm.getMostRecentWindow('zotero:pref'),
  };
  for (const suffix of ['webdav.autoUploadSettings', 'webdav.syncSettings', 'webdav.syncPositions']) {
    Services.prefs.setBoolPref(full(suffix), false);
  }
  Services.prefs.setBoolPref(full('readAloud.sameForAllDocuments'), false);
  Services.prefs.setIntPref(full('readAloud.volume'), 0);
  for (const id of ['openai', 'azure', 'cloudflare', 'speechify', 'fish', 'fishspeech', 'local', 'system']) {
    Services.prefs.setBoolPref(full(id + '.enabled'), false);
  }
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
  const fixtureDir = String(p.fixturesDir || '').replace(/\//g, '\\');
  const specs = [
    { kind: 'pdf', file: PathUtils.join(fixtureDir, 'fixture-a.pdf') },
    { kind: 'epub', file: PathUtils.join(fixtureDir, 'return-key', 'return-key.epub') },
  ];
  const fixtures = [];
  for (const spec of specs) {
    const title = `Zotero-TTS issue 119 ${spec.kind} ${Date.now()}`;
    const imported = await Zotero.Attachments.importFromFile({ file: spec.file, libraryID: Zotero.Libraries.userLibraryID, title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error(`${spec.kind} fixture import returned no item`);
    fixtures.push({ kind: spec.kind, itemID: item.id, key: item.key, title, file: spec.file });
  }
  state.fixtures = fixtures;
  const summary = {};
  for (const [key, entry] of Object.entries(prefs)) {
    const secret = key === 'readAloud.memory' || key === 'readAloud.favoriteVoices'
      || key === 'reader.readAloudVoices' || key.endsWith('.headers') || key.endsWith('.baseURL');
    summary[key] = secret
      ? { present: entry.value !== null && entry.value !== undefined,
        chars: typeof entry.value === 'string' ? entry.value.length : null, user: entry.user }
      : { value: entry.value, user: entry.user };
  }
  return JSON.stringify({
    status: 'PASS', zotero: Zotero.version,
    fixtures: fixtures.map(({ file, ...rest }) => rest), ownerReaders: readers,
    prefs: summary, volume: Zotero.Prefs.get('zotero-tts.readAloud.volume'),
    providersDisabled: true, syncDisabled: true, debugStoring: !!Zotero.Debug.storing,
  }, null, 1);
})()
