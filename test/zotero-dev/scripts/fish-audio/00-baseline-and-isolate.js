(async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 10000, step = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const names = [
    'webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncState',
    'webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings',
    'readAloud.volume', 'readAloud.memory', 'reader.readAloudVoices',
    'fish.enabled', 'fish.apiKey', 'fish.freeOnly', 'fish.voices',
    'fish.includeOfficial', 'fish.includeOwn', 'fish.includeManual',
  ];
  const read = name => {
    const key = name === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + name;
    const type = p.getPrefType(key);
    const hasUser = p.prefHasUserValue(key);
    let value = null;
    if (type === p.PREF_BOOL) value = p.getBoolPref(key);
    else if (type === p.PREF_INT) value = p.getIntPref(key);
    else if (type === p.PREF_STRING) value = p.getStringPref(key);
    return { key, type, hasUser, value };
  };
  const baseline = {};
  for (const name of names) baseline[name] = read(name);
  const extraBaseline = {};
  for (const name of ['readAloud.defaultVoice', 'documentVoiceMigrated', 'documentVoiceChanged']) {
    const key = prefix + name;
    const type = p.getPrefType(key);
    const user = p.prefHasUserValue(key);
    let value;
    if (type === p.PREF_BOOL) value = p.getBoolPref(key);
    else if (type === p.PREF_INT) value = p.getIntPref(key);
    else if (type === p.PREF_STRING) value = p.getStringPref(key);
    extraBaseline[name] = { key, type, user, value };
  }
  const documentRecords = {};
  try {
    const branch = p.getBranch(prefix + 'documentVoices.');
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
  const trimSlash = value => { let out = String(value); while (out.endsWith('/')) out = out.slice(0, -1); return out; };
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
  const pluginDiagnostics = Zotero.ZoteroTTS?.diagnostics;
  const beforeTransportsSettled = pluginDiagnostics ? await waitFor(async () => {
    try {
      const position = JSON.parse(await pluginDiagnostics.position());
      const sync = JSON.parse(await pluginDiagnostics.positionSync());
      const settings = JSON.parse(await pluginDiagnostics.settingsSync());
      const upload = JSON.parse(await pluginDiagnostics.settingsUpload());
      return position.store?.queued === 0 && position.store?.writing === false
        && position.store?.lastError === null && sync.transport?.running === false
        && sync.shared?.transport?.running === false && settings.transport?.pendingChange === false
        && settings.transport?.running === false && upload.autoUpload?.pending === false;
    } catch (_) { return false; }
  }) : true;
  if (!beforeTransportsSettled) throw new Error('WebDAV transports did not settle before destination isolation');
  for (const name of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) p.setBoolPref(prefix + name, false);
  p.setStringPref(prefix + 'webdav.url', configText);
  const destinationMatched = trimSlash(p.getStringPref(prefix + 'webdav.url')) === trimSlash(configText);
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
  const readers = Zotero.Reader?._readers || [];
  for (let i = 0; i < readers.length; i++) {
    const reader = readers[i];
    if (!reader) continue;
    const manager = reader._internalReader?._readAloudManager;
    const item = Zotero.Items.get(reader.itemID);
    readersBefore.push({ itemID: reader.itemID, title: item?.getField?.('title') || null, active: !!manager?.active, paused: manager ? !!manager.paused : null, popupOpen: !!reader._internalReader?.popupOpen });
  }
  const existing = Zotero.__fishVerify;
  Zotero.__fishVerify = {
    ...(existing || {}), baseline, extraBaseline, baselineDocumentVoices: { records: documentRecords },
    configPath, configLength: configText.length, hostBefore, readersBefore,
    openReaderPositionPlugin: positionAddons.length ? positionAddons : false,
    isolated: destinationMatched, beforeTransportsSettled, startedAt: Date.now(), debugBefore: !!Zotero.Debug.storing,
  };
  const safePref = name => {
    const rec = baseline[name];
    if (name === 'fish.apiKey' || name === 'webdav.url' || name === 'webdav.username' || name === 'webdav.password' || name === 'webdav.syncState' || name === 'reader.readAloudVoices') return { type: rec.type, hasUser: rec.hasUser, length: String(rec.value || '').length };
    if (name === 'fish.voices') return { type: rec.type, hasUser: rec.hasUser, length: String(rec.value || '').length };
    return { type: rec.type, hasUser: rec.hasUser, value: rec.value };
  };
  return JSON.stringify({
    status: 'PASS', phase: 'preinstall-safe WebDAV isolation',
    webdav: { configAvailable: true, destinationMatched, switchesSuspended: true, configLength: configText.length },
    openReaderPositionPlugin: positionAddons.length ? positionAddons : false,
    pluginDiagnosticsAvailable: !!pluginDiagnostics,
    beforeTransportsSettled,
    baseline: Object.fromEntries(names.map(name => [name, safePref(name)])),
    documentRecordKeys: Object.keys(documentRecords), readersBefore,
    hostMinimized: !!host && host.windowState === host.STATE_MINIMIZED,
  }, null, 1);
})();
