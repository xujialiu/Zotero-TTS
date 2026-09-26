(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const session = globalThis.__zttsDocumentVoicesSession;
  const params = Zotero.ZoteroTTSRun.params || {};
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const out = { status: 'PASS', regressions: {}, cleanup: {}, errors: [] };
  const isType = (rec, type) => rec && rec.type === type;
  const restoreExact = (name, rec) => {
    if (!rec) return;
    if (!rec.user) {
      if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name);
      return;
    }
    if (rec.type === Ci.nsIPrefBranch.PREF_STRING) Services.prefs.setStringPref(name, String(rec.value ?? ''));
    else if (rec.type === Ci.nsIPrefBranch.PREF_BOOL) Services.prefs.setBoolPref(name, !!rec.value);
    else if (rec.type === Ci.nsIPrefBranch.PREF_INT) Services.prefs.setIntPref(name, Number(rec.value));
  };
  const readJSONPref = name => { try { return JSON.parse(Services.prefs.getStringPref(name)); } catch (_) { return null; } };
  const currentDocumentNames = () => {
    const branch = prefix + 'documentVoices.';
    try { return Services.prefs.getBranch(branch).getChildList('', {}).map(name => branch + name); } catch (_) { return []; }
  };
  const authHeader = () => {
    const user = Services.prefs.getStringPref(prefix + 'webdav.username');
    const pass = Services.prefs.getStringPref(prefix + 'webdav.password');
    const bytes = new TextEncoder().encode(user + ':' + pass);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return 'Basic ' + btoa(binary);
  };
  const webdavURL = () => String(Services.prefs.getStringPref(prefix + 'webdav.url')).replace(/\/+$/, '') + '/';
  const restoreRemote = async () => {
    if (!session || session.remoteSharedSettingsBefore === undefined) return { attempted: false, reason: 'no remote snapshot' };
    const target = webdavURL() + 'zotero-tts-shared-settings.json';
    const headers = { Authorization: authHeader(), 'Content-Type': 'application/json' };
    if (session.remoteSharedSettingsBefore === null) {
      const response = await fetch(target, { method: 'DELETE', headers });
      if (![200, 202, 204, 404].includes(response.status)) throw new Error(`remote DELETE failed: HTTP ${response.status}`);
      return { attempted: true, restored: 'absent', status: response.status };
    }
    const response = await fetch(target, { method: 'PUT', headers, body: session.remoteSharedSettingsBefore });
    if (!response.ok) throw new Error(`remote restore PUT failed: HTTP ${response.status}`);
    return { attempted: true, restored: 'original', status: response.status };
  };
  const closeSettings = async () => {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win?.close) win.close();
    const end = Date.now() + 7000;
    while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() < end) await sleep(100);
  };
  // Regression evidence was exercised before cleanup: beta2's global-speed
  // switch, player handoff/preview, and real Fish timestamp synthesis.
  const speedName = prefix + 'readAloud.globalSpeed';
  const expectedSpeed = session?.prefs?.[speedName]?.value;
  out.regressions = {
    globalSpeedExpected: expectedSpeed,
    globalSpeedCurrent: Services.prefs.getBoolPref(speedName),
    globalSpeedOn: Services.prefs.getBoolPref(speedName) === true,
    handoffCommit: !!state.documentPick?.committed && state.documentPick.after?.saved?.manual === true,
    handoffPreviewHeld: !!state.documentPick?.immediateAfter && state.documentPick.immediateAfter.manual === false,
    speechTimestampEvidence: String(await Zotero.Debug.get()).split('\n').some(line => /\[zotero-tts\] (?:prefetch: )?fish: \d+ word timestamps/i.test(line)),
    syncDeferral: !!state.sync?.playingDeferred && !!state.sync?.pausedDeferred && state.sync.afterReopen?.selected === state.voices?.A?.id,
  };
  if (!out.regressions.globalSpeedOn || !out.regressions.handoffCommit || !out.regressions.handoffPreviewHeld || !out.regressions.speechTimestampEvidence || !out.regressions.syncDeferral) throw new Error(`regression evidence incomplete: ${JSON.stringify(out.regressions)}`);
  await closeSettings();
  // Stop test transports before touching any setting they observe.
  Services.prefs.setBoolPref(prefix + 'webdav.autoUploadSettings', false);
  Services.prefs.setBoolPref(prefix + 'webdav.syncPositions', false);
  Services.prefs.setBoolPref(prefix + 'webdav.syncSettings', false);
  await sleep(600);
  // Close fixture tabs/windows; then remove the dead reader-window entry left
  // by the separate-window persistence check.
  const fixtureIDs = [state.fixtures?.A?.itemID, state.fixtures?.B?.itemID, state.fixtureC?.itemID].filter(Boolean);
  const host = Zotero.getMainWindow?.();
  const readers = Zotero.Reader?._readers || [];
  for (const reader of [...readers]) {
    if (!fixtureIDs.includes(reader?.itemID) || reader?._window?.closed) continue;
    try {
      if (typeof reader.close === 'function') {
        const result = reader.close();
        if (result && typeof result.then === 'function') await result;
      } else if (host?.Zotero_Tabs?.close && reader.tabID) host.Zotero_Tabs.close(reader.tabID);
    } catch (e) { out.errors.push('reader close: ' + String(e)); }
  }
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && (Zotero.Reader?._readers || []).some(reader => fixtureIDs.includes(reader?.itemID) && !reader?._window?.closed)) await sleep(100);
  const list = Zotero.Reader?._readers || [];
  for (let i = list.length - 1; i >= 0; i--) if (fixtureIDs.includes(list[i]?.itemID) && (list[i]?._window?.closed || list[i]?.tabID === null)) list.splice(i, 1);
  const erased = [];
  for (const id of fixtureIDs) {
    try {
      const item = Zotero.Items.get(id);
      if (item) { await item.eraseTx(); erased.push(id); }
    } catch (e) { out.errors.push('erase ' + id + ': ' + String(e)); }
  }
  out.cleanup.erased = erased;
  // Restore the isolated test server before restoring the owner's WebDAV URL.
  try { out.cleanup.remote = await restoreRemote(); } catch (e) { out.errors.push(String(e)); out.cleanup.remote = { attempted: true, restored: false }; }
  // Remove test backup artifacts, which contain the settings snapshot. The
  // runner supplies backupPath; the other names are siblings or state paths.
  const backupPath = String(params.backupPath || state.backup?.path || '');
  const backupParent = backupPath.replace(/[\\/][^\\/]*$/, '');
  const sibling = name => backupParent ? backupParent + (backupPath.includes('\\') ? '\\' : '/') + name : '';
  const backupArtifacts = new Set([
    backupPath, state.backup?.path, state.backup?.isolatedPath, state.backup?.oldPath,
    sibling('document-voices-export-isolated.json'), sibling('document-voices-old.json'),
  ].filter(Boolean));
  if (!backupPath) out.errors.push('backupPath param/state missing');
  for (const path of backupArtifacts) { try { await IOUtils.remove(path, { ignoreAbsent: true }); } catch (e) { out.errors.push('remove backup: ' + String(e)); } }
  const remoteRestored = !!out.cleanup.remote?.attempted && (out.cleanup.remote.restored === 'original' || out.cleanup.remote.restored === 'absent');
  const fixtureReadersGone = !(Zotero.Reader?._readers || []).some(reader => fixtureIDs.includes(reader?.itemID));
  const cleanupOK = out.errors.length === 0 && remoteRestored && erased.length === fixtureIDs.length && fixtureReadersGone;
  out.cleanup.cleanupOK = cleanupOK;
  // Dynamic document records are restored only after every test reader is gone.
  const snapshot = session?.prefs || {};
  for (const name of currentDocumentNames()) if (!snapshot[name]) Services.prefs.clearUserPref(name);
  for (const [name, rec] of Object.entries(snapshot)) if (name.includes('.documentVoices.')) restoreExact(name, rec);
  // Restore all ordinary named prefs except the migration/default/native-memory
  // group and WebDAV connection/toggles, whose ordering matters below.
  const deferred = new Set([
    prefix + 'readAloud.defaultVoice', prefix + 'documentVoiceMigrated', prefix + 'readAloud.memory',
    'extensions.zotero.reader.readAloudVoices', prefix + 'documentVoiceChanged',
    prefix + 'webdav.url', prefix + 'webdav.username', prefix + 'webdav.password', prefix + 'webdav.machineId', prefix + 'webdav.syncState',
    prefix + 'webdav.autoUploadSettings', prefix + 'webdav.syncPositions', prefix + 'webdav.syncSettings',
  ]);
  for (const [name, rec] of Object.entries(snapshot)) if (!deferred.has(name) && !name.includes('.documentVoices.')) restoreExact(name, rec);
  // Native voice entries first; plugin memory observes that write, so restore
  // the exact memory value last among the two.
  if (snapshot['extensions.zotero.reader.readAloudVoices']) restoreExact('extensions.zotero.reader.readAloudVoices', snapshot['extensions.zotero.reader.readAloudVoices']);
  if (snapshot[prefix + 'readAloud.memory']) restoreExact(prefix + 'readAloud.memory', snapshot[prefix + 'readAloud.memory']);
  const oldDefault = snapshot[prefix + 'readAloud.defaultVoice'];
  const oldMarker = snapshot[prefix + 'documentVoiceMigrated'];
  const oldMemory = readJSONPref(prefix + 'readAloud.memory');
  const oldChoice = oldDefault?.value ? (() => { try { return JSON.parse(oldDefault.value); } catch (_) { return null; } })() : null;
  let migrationDisposition = 'exact snapshot restored';
  if (oldDefault && !oldDefault.user && !oldChoice && oldMemory?.voice?.id && oldMemory?.voice?.lang) {
    Services.prefs.setStringPref(prefix + 'readAloud.defaultVoice', JSON.stringify(oldMemory.voice));
    Services.prefs.setBoolPref(prefix + 'documentVoiceMigrated', true);
    migrationDisposition = 'preserved migrated default from preinstall legacy memory; marker=true';
  } else {
    restoreExact(prefix + 'readAloud.defaultVoice', oldDefault);
    restoreExact(prefix + 'documentVoiceMigrated', oldMarker);
  }
  restoreExact(prefix + 'documentVoiceChanged', snapshot[prefix + 'documentVoiceChanged']);
  // Connection first, switches last: turning the original sync/backup values
  // back on is then allowed to use the owner's original destination. If any
  // cleanup step failed, keep all automatic switches off and report it.
  for (const suffix of ['webdav.machineId', 'webdav.syncState', 'webdav.url', 'webdav.username', 'webdav.password']) restoreExact(prefix + suffix, snapshot[prefix + suffix]);
  if (cleanupOK) {
    for (const suffix of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) restoreExact(prefix + suffix, snapshot[prefix + suffix]);
  } else {
    for (const suffix of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) Services.prefs.setBoolPref(prefix + suffix, false);
  }
  await sleep(1200);
  if (session?.debugBefore !== undefined && !!Zotero.Debug.storing !== !!session.debugBefore) Zotero.Debug.setStore(!!session.debugBefore);
  const final = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  out.cleanup.remainingReaders = (Zotero.Reader?._readers || []).length;
  out.cleanup.finalRecords = final.records;
  out.cleanup.finalDefault = final.defaultVoice;
  out.cleanup.migrationDisposition = migrationDisposition;
  out.cleanup.syncRestored = {
    autoUpload: Services.prefs.getBoolPref(prefix + 'webdav.autoUploadSettings'),
    positions: Services.prefs.getBoolPref(prefix + 'webdav.syncPositions'),
    settings: Services.prefs.getBoolPref(prefix + 'webdav.syncSettings'),
  };
  out.cleanup.ownerTogglesRestored = cleanupOK;
  out.cleanup.switchesLeftOffOnFailure = !cleanupOK && Object.values(out.cleanup.syncRestored).every(value => value === false);
  out.cleanup.startupFailed = startup.failed;
  out.cleanup.debugStoring = !!Zotero.Debug.storing;
  if (!cleanupOK || out.cleanup.remainingReaders !== 0 || startup.failed.length) out.status = 'FAIL';
  const result = JSON.stringify(out, null, 1);
  try { Zotero.ZoteroTTSRun.api.reset(); } catch (_) {}
  return result;
})();
