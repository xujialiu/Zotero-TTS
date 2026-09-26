(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state || (run.state = {});
  const params = run.params || {};
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const nativeVoicePref = 'extensions.zotero.reader.readAloudVoices';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 12000, step = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const read = (name, full = false) => {
    const key = name === 'reader.readAloudVoices' ? nativeVoicePref : prefix + name;
    const type = prefs.getPrefType(key);
    const user = prefs.prefHasUserValue(key);
    let value = null;
    try {
      if (type === prefs.PREF_BOOL) value = prefs.getBoolPref(key);
      else if (type === prefs.PREF_INT) value = prefs.getIntPref(key);
      else if (type === prefs.PREF_STRING) value = prefs.getStringPref(key);
    } catch (_) {}
    return { key, type, user, ...(full ? { value } : {}) };
  };
  const names = [
    'webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncState',
    'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings',
    'readAloud.volume', 'readAloud.memory', 'readAloud.remainingTime', 'readAloud.playerLayout',
    'readAloud.openExpanded', 'readAloud.globalSpeed', 'readAloud.sentenceDelayEnabled',
    'readAloud.sentenceDelayMs', 'readAloud.paragraphDelayEnabled', 'readAloud.paragraphDelayMs',
    'readAloud.defaultVoice', 'readAloud.sameForAllDocuments', 'prefetch', 'prefetchEnabled', 'cacheAudio',
    'local.enabled', 'local.baseURL', 'local.voice', 'local.headers',
  ];
  const documentRecords = {};
  try {
    const branch = prefs.getBranch(prefix + 'documentVoices.');
    const children = branch.getChildList('', {});
    for (let i = 0; i < children.length; i++) {
      const suffix = 'documentVoices.' + children[i];
      const record = read(suffix, true);
      documentRecords[suffix] = record;
    }
  } catch (_) {}
  const baseline = { prefs: {}, native: read('reader.readAloudVoices', true), documentRecords, debugStoring: !!Zotero.Debug?.storing };
  for (const name of names) baseline.prefs[name] = read(name, true);
  state.baseline = baseline;
  state.secretLengths = {
    webdavUrl: String(baseline.prefs['webdav.url']?.value || '').length,
    webdavUsername: String(baseline.prefs['webdav.username']?.value || '').length,
    webdavPassword: String(baseline.prefs['webdav.password']?.value || '').length,
    webdavSyncState: String(baseline.prefs['webdav.syncState']?.value || '').length,
    localBaseURL: String(baseline.prefs['local.baseURL']?.value || '').length,
    localHeaders: String(baseline.prefs['local.headers']?.value || '').length,
    memory: String(baseline.prefs['readAloud.memory']?.value || '').length,
    nativeVoices: String(baseline.native?.value || '').length,
  };

  // The test destination is read inside Zotero and only its match result is returned.
  const home = Services.dirsvc.get('Home', Components.interfaces.nsIFile).path;
  const configPath = PathUtils.join(home, '.secrets', 'Zotero-TTS', 'test_webdav.txt');
  let configText;
  try { configText = (await IOUtils.readUTF8(configPath)).trim(); } catch (_) { throw new Error('test WebDAV config unavailable'); }
  if (!/^https?:\/\//i.test(configText)) throw new Error('test WebDAV config is not an URL');
  const trimSlash = value => { let out = String(value); while (out.endsWith('/')) out = out.slice(0, -1); return out; };

  // Fail closed if the companion Position add-on is installed: its destination
  // cannot be switched safely without its own documented preference contract.
  const positionAddons = [];
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
  } catch (error) { throw new Error('OpenReader Position presence check failed: ' + String(error)); }
  if (positionAddons.length) throw new Error('OpenReader Position is installed; refusing isolated run');

  // Wait for any prior transport activity to settle before changing its destination.
  const diagnostics = Zotero.ZoteroTTS?.diagnostics;
  const transportsSettled = diagnostics ? await waitFor(async () => {
    try {
      const position = JSON.parse(await diagnostics.position());
      const sync = JSON.parse(await diagnostics.positionSync());
      const settings = JSON.parse(await diagnostics.settingsSync());
      const upload = JSON.parse(await diagnostics.settingsUpload());
      const pending = position.store?.queued ?? 0;
      return pending === 0 && position.store?.writing === false && position.store?.lastError === null
        && sync.transport?.running === false && sync.shared?.transport?.running === false
        && settings.transport?.pendingChange === false && settings.transport?.running === false
        && upload.autoUpload?.pending === false;
    } catch (_) { return false; }
  }, 15000) : true;
  if (!transportsSettled) throw new Error('WebDAV transports did not settle before destination isolation');

  prefs.setBoolPref(prefix + 'webdav.syncPositions', false);
  prefs.setBoolPref(prefix + 'webdav.autoUploadSettings', false);
  prefs.setBoolPref(prefix + 'webdav.syncSettings', false);
  prefs.setStringPref(prefix + 'webdav.url', configText);
  const destinationMatched = trimSlash(prefs.getStringPref(prefix + 'webdav.url')) === trimSlash(configText);
  if (!destinationMatched) throw new Error('test WebDAV destination did not take effect');

  // Capture owner readers without touching them, then minimize the host as required.
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  const hostBefore = host ? {
    windowState: host.windowState, screenX: host.screenX, screenY: host.screenY,
    outerWidth: host.outerWidth, outerHeight: host.outerHeight,
    selectedTab: host.Zotero_Tabs?.selectedID ?? null,
  } : null;
  const readersBefore = [];
  const readers = Zotero.Reader?._readers || [];
  for (let i = 0; i < readers.length; i++) {
    const reader = readers[i];
    if (!reader) continue;
    const manager = reader._internalReader?._readAloudManager;
    let title = null;
    try {
      const item = Zotero.Items.get(reader.itemID);
      title = (item?.parentItem ? Zotero.Items.get(item.parentItem) : item)?.getField('title') || null;
    } catch (_) {}
    readersBefore.push({ itemID: reader.itemID, title, tabID: reader.tabID ?? null, active: !!manager?.active, paused: manager ? !!manager.paused : null, popupOpen: !!reader._internalReader?._state?.readAloudState?.popupOpen });
  }
  if (host?.minimize) host.minimize(); else if (host) host.windowState = host.STATE_MINIMIZED;
  await sleep(700);
  if (host && host.windowState !== 2) throw new Error('Zotero host did not minimize for baseline');
  if (!baseline.debugStoring) try { Zotero.Debug.setStore(true); } catch (_) {}
  state.isolation = { configPath, configLength: configText.length, destinationMatched, transportsSettled, positionAddons, hostBefore, readersBefore, startedAt: Date.now() };
  state.errorsBefore = (Zotero.getErrors?.() || []).map(String);
  const summary = {};
  for (const name of names) {
    const rec = baseline.prefs[name];
    const secret = name.endsWith('.password') || name.endsWith('.username') || name.endsWith('.headers')
      || name.endsWith('.baseURL') || name === 'webdav.url' || name === 'webdav.syncState'
      || name === 'readAloud.memory';
    summary[name] = secret ? { type: rec.type, user: rec.user, length: String(rec.value || '').length } : { type: rec.type, user: rec.user, value: rec.value };
  }
  summary['reader.readAloudVoices'] = { type: baseline.native.type, user: baseline.native.user, length: String(baseline.native.value || '').length };
  return JSON.stringify({ step: 'baseline-and-isolate', destinationMatched, transportsSettled, openReaderPosition: false, hostMinimized: host?.windowState === 2, readersBefore, preferenceSummary: summary }, null, 1);
})()
