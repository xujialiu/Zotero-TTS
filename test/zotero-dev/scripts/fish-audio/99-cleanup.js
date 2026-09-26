(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const session = Zotero.__fishVerify || {};
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const errors = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 15000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const restore = rec => {
    if (!rec) return;
    const key = rec.key;
    if (!rec.hasUser && !rec.user) {
      if (p.prefHasUserValue(key)) p.clearUserPref(key);
      return;
    }
    const type = rec.type;
    const value = rec.value;
    if (type === p.PREF_STRING) p.setStringPref(key, String(value ?? ''));
    else if (type === p.PREF_BOOL) p.setBoolPref(key, !!value);
    else if (type === p.PREF_INT) p.setIntPref(key, Number(value));
  };
  const closePrefs = async () => {
    try {
      const win = Services.wm.getMostRecentWindow('zotero:pref');
      if (win?.close) win.close();
      await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 7000);
    } catch (e) { errors.push('settings close: ' + String(e)); }
  };
  await closePrefs();

  const fixtureID = Number(state.fixture?.itemID || 0);
  const fixtureReaders = [];
  const readerList = [...(Zotero.Reader?._readers || [])];
  for (let i = 0; i < readerList.length; i++) {
    const reader = readerList[i];
    if (reader?.itemID !== fixtureID) continue;
    fixtureReaders.push(reader);
    try {
      if (reader._internalReader?._readAloudManager?.active) reader._internalReader.toggleReadAloudPopup(false);
      await waitFor(() => !reader._internalReader?._readAloudManager?.active, 7000);
      const main = Zotero.getMainWindow?.();
      if (reader.tabID && main?.Zotero_Tabs?.close) main.Zotero_Tabs.close(reader.tabID);
    } catch (e) { errors.push('fixture reader close: ' + String(e)); }
  }
  await waitFor(() => !(Zotero.Reader?._readers || []).some(reader => reader?.itemID === fixtureID && !reader?._window?.closed), 10000);
  if (fixtureID) {
    try {
      const item = Zotero.Items.get(fixtureID);
      if (item) await item.eraseTx();
    } catch (e) { errors.push('fixture erase: ' + String(e)); }
  }
  const fixtureGone = fixtureID ? !Zotero.Items.get(fixtureID) : true;
  for (let i = (Zotero.Reader?._readers || []).length - 1; i >= 0; i--) {
    const reader = Zotero.Reader._readers[i];
    if (reader?.itemID === fixtureID && (reader?._window?.closed || reader?.tabID === null)) Zotero.Reader._readers.splice(i, 1);
  }
  const fixtureReaderGone = !(Zotero.Reader?._readers || []).some(reader => reader?.itemID === fixtureID);

  // Restore all dynamic document records byte-for-byte after every fixture
  // reader is gone. The baseline report is kept in the private session only.
  const baselineDocs = session.baselineDocumentVoices?.records || {};
  try {
    const branch = p.getBranch(prefix + 'documentVoices.');
    const names = branch.getChildList('', {});
    for (let i = 0; i < names.length; i++) {
      const suffix = names[i];
      if (!Object.prototype.hasOwnProperty.call(baselineDocs, 'documentVoices.' + suffix)) branch.clearUserPref(suffix);
    }
  } catch (e) { errors.push('document voice cleanup: ' + String(e)); }
  for (const [name, value] of Object.entries(baselineDocs)) {
    try { p.setStringPref(prefix + name, value); } catch (e) { errors.push('document voice restore: ' + name + ': ' + String(e)); }
  }

  // Reader close can queue a bookmark write even while WebDAV is off. Wait
  // for the local store and both transports to settle, then compare the
  // database/shared counts with the isolated baseline before restoring any
  // automatic switch. This also proves an absent OpenReader Position add-on
  // was not silently used as a second transport.
  let positionAfter = null;
  let positionSyncAfter = null;
  let settingsSyncAfter = null;
  let settingsUploadAfter = null;
  const positionSettled = await waitFor(async () => {
    try {
      positionAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
      positionSyncAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
      settingsSyncAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
      settingsUploadAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
      return positionAfter.store?.queued === 0
        && positionAfter.store?.writing === false
        && positionAfter.store?.lastError === null
        && positionSyncAfter.transport?.running === false
        && positionSyncAfter.shared?.transport?.running === false
        && settingsSyncAfter.transport?.pendingChange === false
        && settingsSyncAfter.transport?.running === false
        && settingsUploadAfter.autoUpload?.pending === false;
    } catch (_) { return false; }
  }, 10000, 150);
  const baselinePosition = session.positionBefore || {};
  const baselinePositionSync = session.positionSyncBefore || {};
  const baselineSettingsSync = session.settingsSyncBefore || {};
  const baselineSettingsUpload = session.settingsUploadBefore || {};
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const positionCounts = {
    databaseRows: { before: baselinePosition.database?.rows ?? null, after: positionAfter?.database?.rows ?? null },
    storeLoaded: { before: baselinePosition.store?.loaded ?? null, after: positionAfter?.store?.loaded ?? null },
    storeDeletions: { before: baselinePosition.store?.deletions ?? null, after: positionAfter?.store?.deletions ?? null },
    localEntries: { before: baselinePositionSync.localEntries ?? null, after: positionSyncAfter?.localEntries ?? null },
    sharedDocuments: { before: baselinePositionSync.shared?.documents ?? null, after: positionSyncAfter?.shared?.documents ?? null },
    sharedItems: { before: baselinePositionSync.shared?.documents?.items ?? null, after: positionSyncAfter?.shared?.documents?.items ?? null },
  };
  const positionClean = !!positionSettled
    && positionCounts.databaseRows.before === positionCounts.databaseRows.after
    && positionCounts.storeLoaded.before === positionCounts.storeLoaded.after
    && positionCounts.storeDeletions.before === positionCounts.storeDeletions.after
    && positionCounts.localEntries.before === positionCounts.localEntries.after
    && same(positionCounts.sharedDocuments.before, positionCounts.sharedDocuments.after)
    && positionAfter.readers?.every(reader => reader.itemID !== fixtureID);
  const pendingWrites = {
    positionStore: { queued: positionAfter?.store?.queued ?? null, writing: positionAfter?.store?.writing ?? null, lastError: positionAfter?.store?.lastError ?? null },
    positionTransport: { running: positionSyncAfter?.transport?.running ?? null, uploaded: positionSyncAfter?.transport?.uploaded ?? null, lastError: positionSyncAfter?.transport?.lastError ?? null },
    sharedTransport: { running: positionSyncAfter?.shared?.transport?.running ?? null, uploaded: positionSyncAfter?.shared?.transport?.uploaded ?? null, lastError: positionSyncAfter?.shared?.transport?.lastError ?? null },
    settingsSync: { pendingChange: settingsSyncAfter?.transport?.pendingChange ?? null, running: settingsSyncAfter?.transport?.running ?? null, lastError: settingsSyncAfter?.transport?.lastError ?? null },
    settingsUpload: { pending: settingsUploadAfter?.autoUpload?.pending ?? null, lastError: settingsUploadAfter?.autoUpload?.lastError ?? null },
  };

  // Keep all WebDAV writes suspended until the local fixture and records are
  // clean. Restore ordinary Fish/Read Aloud settings from named snapshots.
  const deferred = new Set([
    'webdav.url','webdav.username','webdav.password','webdav.machineId','webdav.syncState',
    'webdav.autoUploadSettings','webdav.syncPositions','webdav.syncSettings',
    'readAloud.memory','reader.readAloudVoices','readAloud.defaultVoice','documentVoiceMigrated','documentVoiceChanged',
  ]);
  for (const [name, rec] of Object.entries(session.baseline || {})) {
    if (deferred.has(name)) continue;
    try { restore(rec); } catch (e) { errors.push('restore ' + name + ': ' + String(e)); }
  }

  // Native voice memory and plugin memory are observers of one another. The
  // native record goes first and the exact plugin memory last.
  try {
    if (session.baseline?.['reader.readAloudVoices']) restore(session.baseline['reader.readAloudVoices']);
    if (session.baseline?.['readAloud.memory']) restore(session.baseline['readAloud.memory']);
  } catch (e) { errors.push('memory restore: ' + String(e)); }
  for (const name of ['readAloud.defaultVoice','documentVoiceMigrated','documentVoiceChanged']) {
    try { restore(session.extraBaseline?.[name] ? { ...session.extraBaseline[name], key: prefix + name } : null); } catch (e) { errors.push('restore ' + name + ': ' + String(e)); }
  }

  // Restore the owner's connection fields before deciding whether it is safe
  // to restore the original automatic switches.
  for (const name of ['webdav.machineId','webdav.syncState','webdav.url','webdav.username','webdav.password']) {
    try { restore(session.baseline?.['webdav.' + name.slice('webdav.'.length)]); } catch (e) { errors.push('WebDAV connection restore: ' + name + ': ' + String(e)); }
  }
  const localClean = errors.length === 0 && fixtureGone && fixtureReaderGone && positionClean;
  let syncRestored = false;
  if (localClean) {
    for (const name of ['webdav.autoUploadSettings','webdav.syncPositions','webdav.syncSettings']) {
      try { restore(session.baseline?.[name]); } catch (e) { errors.push('WebDAV switch restore: ' + name + ': ' + String(e)); }
    }
    syncRestored = errors.length === 0;
  } else {
    for (const name of ['webdav.autoUploadSettings','webdav.syncPositions','webdav.syncSettings']) {
      try { p.setBoolPref(prefix + name, false); } catch (e) { errors.push('safety switch ' + name + ': ' + String(e)); }
    }
  }

  if (session.debugBefore !== undefined && !!Zotero.Debug.storing !== !!session.debugBefore) {
    try { Zotero.Debug.setStore(!!session.debugBefore); } catch (e) { errors.push('debug store restore: ' + String(e)); }
  }
  const host = Zotero.getMainWindow?.() || Services.wm.getMostRecentWindow('navigator:browser');
  try {
    if (host?.Zotero_Tabs?.select && session.hostBefore?.selectedTab) host.Zotero_Tabs.select(session.hostBefore.selectedTab);
    if (host?.minimize) host.minimize();
    else if (host) host.windowState = host.STATE_MINIMIZED;
    await sleep(700);
  } catch (e) { errors.push('host restore: ' + String(e)); }
  const restored = {
    fish: Object.fromEntries(['enabled','freeOnly','voices','includeOfficial','includeOwn','includeManual'].map(name => {
      const key = prefix + 'fish.' + name;
      const type = p.getPrefType(key);
      let value = null;
      if (type === p.PREF_BOOL) value = p.getBoolPref(key);
      else if (type === p.PREF_INT) value = p.getIntPref(key);
      else if (type === p.PREF_STRING) value = name === 'voices' ? {length:p.getStringPref(key).length} : p.getStringPref(key);
      return [name, value];
    })),
    webdav: {
      destinationMatched: !!session.baseline?.['webdav.url'] && p.getStringPref(prefix + 'webdav.url') === session.baseline['webdav.url'].value,
      syncPositions: p.getBoolPref(prefix + 'webdav.syncPositions'),
      autoUploadSettings: p.getBoolPref(prefix + 'webdav.autoUploadSettings'),
      syncSettings: p.getBoolPref(prefix + 'webdav.syncSettings'),
    },
    debugStoring: !!Zotero.Debug.storing,
    hostMinimized: !!host && host.windowState === host.STATE_MINIMIZED,
    settingsClosed: !Services.wm.getMostRecentWindow('zotero:pref'),
  };
  const nativeBaseline = session.baseline?.['reader.readAloudVoices'];
  const nativeKey = 'extensions.zotero.reader.readAloudVoices';
  const nativeType = p.getPrefType(nativeKey);
  const nativeHasUser = p.prefHasUserValue(nativeKey);
  let nativeValue = null;
  if (nativeType === p.PREF_STRING) nativeValue = p.getStringPref(nativeKey);
  else if (nativeType === p.PREF_BOOL) nativeValue = p.getBoolPref(nativeKey);
  else if (nativeType === p.PREF_INT) nativeValue = p.getIntPref(nativeKey);
  const nativeMatches = !!nativeBaseline
    && nativeType === nativeBaseline.type
    && nativeHasUser === nativeBaseline.hasUser
    && nativeValue === nativeBaseline.value;
  restored.nativeReaderVoices = { matches: nativeMatches, type: nativeType, hasUser: nativeHasUser, length: typeof nativeValue === 'string' ? nativeValue.length : null };
  const baselineSync = session.baseline ? {
    syncPositions: !!session.baseline['webdav.syncPositions']?.value,
    autoUploadSettings: !!session.baseline['webdav.autoUploadSettings']?.value,
    syncSettings: !!session.baseline['webdav.syncSettings']?.value,
  } : null;
  const syncMatches = baselineSync && restored.webdav.syncPositions === baselineSync.syncPositions
    && restored.webdav.autoUploadSettings === baselineSync.autoUploadSettings
    && restored.webdav.syncSettings === baselineSync.syncSettings;
  const cleanupOK = errors.length === 0 && fixtureGone && fixtureReaderGone && positionClean && nativeMatches && syncRestored && syncMatches && restored.webdav.destinationMatched && restored.settingsClosed;
  const result = {
    status: cleanupOK ? 'PASS' : 'FAIL', errors, fixtureID, fixtureGone, fixtureReaderGone, localClean, positionClean,
    positionCounts, pendingWrites, openReaderPositionPlugin: session.openReaderPositionPlugin || false,
    syncRestored, syncMatches, restored,
  };
  delete Zotero.__fishVerify;
  return JSON.stringify(result, null, 1);
})();
