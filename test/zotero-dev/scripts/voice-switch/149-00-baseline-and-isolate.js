(async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 15000, step = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = false;
      try { value = await test(); } catch (_) { value = false; }
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const named = [
    'webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncState',
    'webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings',
    'readAloud.volume', 'readAloud.memory', 'readAloud.sameForAllDocuments', 'readAloud.globalSpeed',
    'readAloud.favoriteVoices', 'readAloud.favoritesOnly', 'readAloud.defaultVoice',
    'fish.enabled', 'fish.apiKey', 'fish.freeOnly', 'fish.voices',
    'local.enabled', 'local.engine', 'local.baseURL', 'local.username', 'local.password',
    'local.apiKey', 'local.includeOwn', 'local.includeOfficial',
  ];
  const full = suffix => prefix + suffix;
  const read = suffix => {
    const key = suffix === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : full(suffix);
    const type = p.getPrefType(key);
    let value = null;
    if (type === p.PREF_BOOL) value = p.getBoolPref(key);
    else if (type === p.PREF_INT) value = p.getIntPref(key);
    else if (type === p.PREF_STRING) value = p.getStringPref(key);
    return { key, type, user: p.prefHasUserValue(key), value };
  };
  const baseline = {};
  for (const suffix of named) baseline[suffix] = read(suffix);
  baseline['reader.readAloudVoices'] = read('reader.readAloudVoices');
  const extra = {};
  for (const suffix of ['documentVoiceMigrated', 'documentVoiceChanged']) {
    extra[suffix] = read(suffix);
  }
  const documentRecords = {};
  try {
    const branch = p.getBranch(full('documentVoices.'));
    const children = branch.getChildList('', {});
    for (let i = 0; i < children.length; i++) {
      const suffix = children[i];
      try { documentRecords['documentVoices.' + suffix] = branch.getStringPref(suffix); } catch (_) {}
    }
  } catch (_) {}

  const home = Services.dirsvc.get('Home', Components.interfaces.nsIFile).path;
  const configPath = PathUtils.join(home, '.secrets', 'Zotero-TTS', 'test_webdav.txt');
  let configText;
  try { configText = (await IOUtils.readUTF8(configPath)).trim(); } catch (_) { throw new Error('test WebDAV config unavailable'); }
  if (!(configText.startsWith('http://') || configText.startsWith('https://'))) throw new Error('test WebDAV config is not an URL');

  let positionAddons = [];
  try {
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addons = await AddonManager.getAllAddons();
    for (let i = 0; i < addons.length; i++) {
      const addon = addons[i];
      const haystack = (String(addon.id || '') + ' ' + String(addon.name || '')).toLowerCase();
      if (haystack.includes('openreader') || haystack.includes('open reader') || haystack.includes('position')) {
        positionAddons.push({ id: addon.id, name: addon.name, version: addon.version, active: !!addon.isActive });
      }
    }
  } catch (e) { throw new Error('OpenReader Position presence check failed: ' + String(e)); }
  if (positionAddons.length) throw new Error(`OpenReader Position is installed; refusing isolated run: ${JSON.stringify(positionAddons)}`);

  const diagnostics = Zotero.ZoteroTTS?.diagnostics;
  const beforeTransportsSettled = diagnostics ? await waitFor(async () => {
    const position = JSON.parse(await diagnostics.position());
    const sync = JSON.parse(await diagnostics.positionSync());
    const settings = JSON.parse(await diagnostics.settingsSync());
    const upload = JSON.parse(await diagnostics.settingsUpload());
    return position.store?.queued === 0 && position.store?.writing === false && position.store?.lastError === null
      && sync.transport?.running === false && sync.shared?.transport?.running === false
      && settings.transport?.pendingChange === false && settings.transport?.running === false
      && upload.autoUpload?.pending === false;
  }) : true;
  if (!beforeTransportsSettled) throw new Error('WebDAV transports did not settle before destination isolation');
  for (const suffix of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) p.setBoolPref(full(suffix), false);
  p.setStringPref(full('webdav.url'), configText);
  const trimSlash = value => { let out = String(value); while (out.endsWith('/')) out = out.slice(0, -1); return out; };
  const destinationMatched = trimSlash(p.getStringPref(full('webdav.url'))) === trimSlash(configText);
  if (!destinationMatched) throw new Error('test WebDAV destination did not take effect');

  const host = Services.wm.getMostRecentWindow('navigator:browser');
  const hostBefore = host ? {
    windowState: host.windowState, screenX: host.screenX, screenY: host.screenY,
    outerWidth: host.outerWidth, outerHeight: host.outerHeight,
    selectedTab: host.Zotero_Tabs?.selectedID ?? null,
  } : null;
  if (host?.minimize) host.minimize();
  else if (host) host.windowState = host.STATE_MINIMIZED;
  await sleep(700);

  const readersBefore = [];
  const list = Zotero.Reader?._readers || [];
  for (let i = 0; i < list.length; i++) {
    const reader = list[i];
    if (!reader) continue;
    const manager = reader._internalReader?._readAloudManager;
    const item = Zotero.Items.get(reader.itemID);
    readersBefore.push({
      itemID: reader.itemID, title: item?.getField?.('title') || null,
      tabID: reader.tabID ?? null, active: !!manager?.active,
      paused: manager ? !!manager.paused : null,
      popupOpen: !!reader._internalReader?._state?.readAloudState?.popupOpen,
      selectedVoice: manager?.selectedVoiceID ?? null,
    });
  }
  const existing = Zotero.__ztts149;
  Zotero.__ztts149 = {
    ...(existing || {}), baseline, extra, documentRecords, configLength: configText.length,
    hostBefore, readersBefore, positionAddons: positionAddons.length ? positionAddons : false,
    destinationMatched, beforeTransportsSettled, debugBefore: !!Zotero.Debug.storing,
    startedAt: Date.now(), configPath,
  };
  const safe = (suffix, rec) => {
    const secret = suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices'
      || /(?:password|apiKey|username|url|syncState|machineId)$/.test(suffix)
      || suffix === 'fish.voices';
    return secret ? { type: rec.type, user: rec.user, chars: typeof rec.value === 'string' ? rec.value.length : null }
      : { type: rec.type, user: rec.user, value: rec.value };
  };
  return JSON.stringify({
    status: 'PASS', phase: 'preinstall-safe WebDAV isolation',
    webdav: { configAvailable: true, destinationMatched, switchesSuspended: true, configLength: configText.length },
    openReaderPositionPlugin: positionAddons.length ? positionAddons : false,
    beforeTransportsSettled, baseline: Object.fromEntries(Object.entries(baseline).map(([k, v]) => [k, safe(k, v)])),
    documentRecordKeys: Object.keys(documentRecords), readersBefore,
    hostMinimized: !!host && host.windowState === host.STATE_MINIMIZED,
  }, null, 1);
})();
