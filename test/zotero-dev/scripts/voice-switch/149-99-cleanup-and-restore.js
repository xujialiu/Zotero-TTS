(async () => {
  const session = Zotero.__ztts149;
  if (!session?.baseline || !session.fixtures) throw new Error('149 baseline/fixtures are missing');
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const errors = [];
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
  const readTyped = key => {
    const type = p.getPrefType(key);
    let value = null;
    try {
      if (type === p.PREF_BOOL) value = p.getBoolPref(key);
      else if (type === p.PREF_INT) value = p.getIntPref(key);
      else if (type === p.PREF_STRING) value = p.getStringPref(key);
    } catch (_) {}
    return { type, user: p.prefHasUserValue(key), value };
  };
  const restore = rec => {
    if (!rec?.key) return;
    const key = rec.key;
    if (!rec.user) { if (p.prefHasUserValue(key)) p.clearUserPref(key); return; }
    if (rec.type === p.PREF_BOOL) p.setBoolPref(key, !!rec.value);
    else if (rec.type === p.PREF_INT) p.setIntPref(key, Number(rec.value));
    else if (rec.type === p.PREF_STRING) p.setStringPref(key, String(rec.value ?? ''));
  };
  const readerFor = itemID => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) {
      try { if (!Components.utils.isDeadWrapper?.(list[i]) && list[i]?.itemID === itemID) return list[i]; } catch (_) {}
    }
    return null;
  };
  const closeFixture = async itemID => {
    const reader = readerFor(itemID);
    if (!reader) return { itemID, closed: false, gone: true };
    try { reader._internalReader?.toggleReadAloudPopup(false); } catch (e) { errors.push('fixture popup close: ' + String(e)); }
    try { const pending = reader.close?.(); if (pending && typeof pending.then === 'function') await pending; } catch (e) { errors.push('fixture close: ' + String(e)); }
    const gone = await waitFor(() => !readerFor(itemID), 10000, 100);
    return { itemID, closed: true, gone: !!gone };
  };
  const settle = async () => await waitFor(async () => {
    try {
      const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
      const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
      const settings = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
      const upload = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
      return position.store?.queued === 0 && position.store?.writing === false && position.store?.lastError === null
        && sync.transport?.running === false && sync.shared?.transport?.running === false
        && settings.transport?.pendingChange === false && settings.transport?.running === false
        && upload.autoUpload?.pending === false;
    } catch (_) { return false; }
  }, 15000, 150);
  const fixtureIDs = session.fixtures.map(row => row.itemID);
  const readersClosed = [];
  for (const itemID of fixtureIDs) readersClosed.push(await closeFixture(itemID));
  const erased = [];
  for (const itemID of fixtureIDs) {
    try {
      const item = Zotero.Items.get(itemID);
      if (item) { await item.eraseTx(); erased.push({ itemID, erased: true }); }
      else erased.push({ itemID, erased: false, absent: true });
    } catch (e) { erased.push({ itemID, erased: false, error: String(e) }); errors.push('fixture erase: ' + String(e)); }
  }
  // Remove only stale fixture wrappers left by our close/reopen cycle. Owner readers are retained.
  for (let i = (Zotero.Reader?._readers || []).length - 1; i >= 0; i--) {
    const r = Zotero.Reader._readers[i];
    try {
      if (!fixtureIDs.includes(r?.itemID)) continue;
      let bad = false;
      try { void r?._internalReader?._readAloudManager; } catch (_) { bad = true; }
      if (bad) Zotero.Reader._readers.splice(i, 1);
    } catch (_) {}
  }
  const fixtureReadersRemaining = (Zotero.Reader?._readers || []).filter(r => fixtureIDs.includes(r?.itemID)).length;
  const fixtureItemsRemaining = fixtureIDs.filter(id => !!Zotero.Items.get(id)).length;

  // Restore fixture-created document records exactly to the private baseline.
  const baselineDocs = session.documentRecords || {};
  try {
    const branch = p.getBranch(prefix + 'documentVoices.');
    const names = branch.getChildList('', {});
    for (let i = 0; i < names.length; i++) {
      const full = 'documentVoices.' + names[i];
      if (!Object.prototype.hasOwnProperty.call(baselineDocs, full)) branch.clearUserPref(names[i]);
    }
  } catch (e) { errors.push('document record cleanup: ' + String(e)); }
  for (const [name, value] of Object.entries(baselineDocs)) {
    try { p.setStringPref(prefix + name, value); } catch (e) { errors.push('document record restore: ' + name + ': ' + String(e)); }
  }

  const pendingClean = await settle();
  const positionAfter = (() => { try { return JSON.parse(Zotero.ZoteroTTS.diagnostics.position()); } catch (_) { return null; } })();
  const baselinePositionRows = session.positionBefore?.database?.rows ?? null;
  let positionNow = null;
  try { positionNow = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (_) {}
  const positionRowsNow = positionNow?.database?.rows ?? null;

  // Restore all ordinary prefs while WebDAV writes remain suspended. Memory and native voices go last.
  const deferred = new Set(['webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncState', 'webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings', 'readAloud.memory', 'reader.readAloudVoices']);
  for (const rec of Object.values(session.baseline)) if (!deferred.has(Object.keys(session.baseline).find(k => session.baseline[k] === rec) || '')) { try { restore(rec); } catch (e) { errors.push('pref restore: ' + String(e)); } }
  // The identity comparison above is deliberately supplemented by named restores because object identity is not stable across engines.
  for (const [suffix, rec] of Object.entries(session.baseline)) {
    if (deferred.has(suffix)) continue;
    try { restore(rec); } catch (e) { errors.push('named pref restore ' + suffix + ': ' + String(e)); }
  }
  try { restore(session.baseline['reader.readAloudVoices']); } catch (e) { errors.push('native voice restore: ' + String(e)); }
  try { restore(session.baseline['readAloud.memory']); } catch (e) { errors.push('memory restore: ' + String(e)); }
  for (const rec of Object.values(session.extra || {})) { try { restore(rec); } catch (e) { errors.push('extra pref restore: ' + String(e)); } }

  const localClean = errors.length === 0 && fixtureReadersRemaining === 0 && fixtureItemsRemaining === 0 && pendingClean;
  let webdavConnectionRestored = false;
  let syncRestored = false;
  if (localClean) {
    for (const suffix of ['webdav.machineId', 'webdav.syncState', 'webdav.url', 'webdav.username', 'webdav.password']) {
      try { restore(session.baseline[suffix]); } catch (e) { errors.push('WebDAV connection restore ' + suffix + ': ' + String(e)); }
    }
    webdavConnectionRestored = errors.length === 0;
    if (webdavConnectionRestored) {
      for (const suffix of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) {
        try { restore(session.baseline[suffix]); } catch (e) { errors.push('WebDAV switch restore ' + suffix + ': ' + String(e)); }
      }
      syncRestored = errors.length === 0;
    }
  } else {
    errors.push('cleanup not clean; automatic WebDAV switches remain suspended');
    for (const suffix of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) { try { p.setBoolPref(prefix + suffix, false); } catch (_) {} }
  }
  if (session.debugBefore !== undefined && !!Zotero.Debug.storing !== !!session.debugBefore) { try { Zotero.Debug.setStore(!!session.debugBefore); } catch (e) { errors.push('debug-store restore: ' + String(e)); } }
  const host = Zotero.getMainWindow?.() || Services.wm.getMostRecentWindow('navigator:browser');
  try {
    if (host?.Zotero_Tabs?.select && session.hostBefore?.selectedTab) host.Zotero_Tabs.select(session.hostBefore.selectedTab);
    if (host?.minimize) host.minimize(); else if (host) host.windowState = host.STATE_MINIMIZED;
    await sleep(700);
  } catch (e) { errors.push('host minimize/selection restore: ' + String(e)); }
  const final = {
    volume: readTyped(prefix + 'readAloud.volume'),
    memory: { chars: readTyped(prefix + 'readAloud.memory').value?.length ?? null, user: readTyped(prefix + 'readAloud.memory').user, equalToBaseline: readTyped(prefix + 'readAloud.memory').value === session.baseline['readAloud.memory']?.value },
    nativeVoices: { chars: readTyped('extensions.zotero.reader.readAloudVoices').value?.length ?? null, user: readTyped('extensions.zotero.reader.readAloudVoices').user, equalToBaseline: readTyped('extensions.zotero.reader.readAloudVoices').value === session.baseline['reader.readAloudVoices']?.value },
    sync: { positions: p.getBoolPref(prefix + 'webdav.syncPositions'), settings: p.getBoolPref(prefix + 'webdav.syncSettings'), autoUpload: p.getBoolPref(prefix + 'webdav.autoUploadSettings') },
    webdavDestinationMatchesBaseline: readTyped(prefix + 'webdav.url').value === session.baseline['webdav.url']?.value,
    debugStoring: !!Zotero.Debug.storing,
    hostMinimized: !!host && host.windowState === host.STATE_MINIMIZED,
  };
  const cleanupOK = localClean && webdavConnectionRestored && syncRestored && final.memory.equalToBaseline && final.nativeVoices.equalToBaseline && final.webdavDestinationMatchesBaseline && final.hostMinimized;
  if (cleanupOK) delete Zotero.__ztts149;
  return JSON.stringify({ status: cleanupOK ? 'PASS' : 'FAIL', errors, readersClosed, erased, fixtureReadersRemaining, fixtureItemsRemaining, pendingClean, positionRows: { baseline: baselinePositionRows, after: positionRowsNow }, localClean, webdavConnectionRestored, syncRestored, final }, null, 1);
})();
