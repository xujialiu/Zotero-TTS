return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const keys = [
    'readAloud.volume', 'readAloud.sameForAllDocuments', 'readAloud.globalSpeed',
    'readAloud.favoriteVoices', 'readAloud.favoritesOnly', 'readAloud.sentenceDelayEnabled',
    'readAloud.sentenceDelayMs', 'readAloud.paragraphDelayEnabled', 'readAloud.paragraphDelayMs',
    'shortcuts.previousVoice', 'shortcuts.nextVoice', 'webdav.syncPositions',
    'webdav.autoUploadSettings', 'webdav.syncSettings', 'readAloud.memory',
    'local.enabled', 'local.engine', 'local.baseURL', 'local.voice', 'local.headers',
  ];
  const read = suffix => { let value = null; try { value = Zotero.Prefs.get('zotero-tts.' + suffix); } catch (e) {}
    return { value, user: Services.prefs.prefHasUserValue(prefix + suffix) }; };
  const prefs = {}; for (const suffix of keys) prefs[suffix] = read(suffix);
  const nativeName = 'extensions.zotero.reader.readAloudVoices';
  let nativeValue = null; try { nativeValue = Zotero.Prefs.get('reader.readAloudVoices'); } catch (e) {}
  prefs['reader.readAloudVoices'] = { value: nativeValue, user: Services.prefs.prefHasUserValue(nativeName) };
  const readers = [], list = Zotero.Reader._readers || [];
  for (let i = 0; i < list.length; i++) {
    const reader = list[i], manager = reader?._internalReader?._readAloudManager, controller = manager?._controller;
    let title = null; try { const item = Zotero.Items.get(reader.itemID); title = (item?.parentItem ?? item)?.getField('title') ?? null; } catch (e) {}
    readers.push({ index: i, itemID: reader?.itemID ?? null, title, tabID: reader?.tabID ?? null,
      active: !!manager?.active, paused: manager ? !!manager.paused : null, popupOpen: !!reader?._internalReader?._state?.readAloudState?.popupOpen,
      selectedVoice: manager?.selectedVoiceID ?? null, selectedTier: manager?._selectedTier ?? null,
      speed: Number.isFinite(manager?.speed) ? manager.speed : null, position: Number.isFinite(controller?._position) ? controller._position : null,
      currentIndex: Number.isFinite(controller?._currentIndex) ? controller._currentIndex : null,
      audioState: controller?._audioContext?.state ?? null, audioTime: Number.isFinite(controller?._audioContext?.currentTime) ? controller._audioContext.currentTime : null });
  }
  const mw = Zotero.getMainWindow?.() ?? Services.wm.getMostRecentWindow('navigator:browser');
  const baseline = { version: 'issue-95-kokoro-beta5-v1', prefs, readers, debugStoring: !!Zotero.Debug.storing,
    main: { selectedIndex: mw?.Zotero_Tabs?.selectedIndex ?? null, selectedID: mw?.Zotero_Tabs?.selectedID ?? null },
    settingsWindowOpen: !!Services.wm.getMostRecentWindow('zotero:pref') };
  try { baseline.position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { baseline.position = { error: String(e) }; }
  Zotero.__ztts95Kokoro = baseline;
  const summary = {};
  for (const [suffix, entry] of Object.entries(prefs)) {
    const secret = suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices' || suffix === 'readAloud.favoriteVoices' || suffix === 'local.headers';
    summary[suffix] = secret ? { present: entry.value !== null && entry.value !== undefined, chars: typeof entry.value === 'string' ? entry.value.length : null, user: entry.user }
      : { value: entry.value, user: entry.user };
  }
  return JSON.stringify({ stored: true, version: baseline.version, zoteroVersion: Zotero.version, platform: Services.appinfo.OS,
    provider: { engine: summary['local.engine'], baseURL: summary['local.baseURL'], voice: summary['local.voice'], headers: summary['local.headers'] },
    readers, main: baseline.main, settingsWindowOpen: baseline.settingsWindowOpen, debugStoring: baseline.debugStoring, prefs: summary,
    position: { rows: baseline.position?.database?.rows ?? null, legacyPref: baseline.position?.legacyPref ?? null,
      queued: baseline.position?.store?.queued ?? null, lastError: baseline.position?.store?.lastError ?? null } }, null, 1);
})()
