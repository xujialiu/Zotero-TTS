(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const baseline = state.baseline || {};
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const nativeKey = 'extensions.zotero.reader.readAloudVoices';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 15000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const readTyped = key => {
    const type = prefs.getPrefType(key), user = prefs.prefHasUserValue(key);
    let value = null;
    try { if (type === prefs.PREF_BOOL) value = prefs.getBoolPref(key); else if (type === prefs.PREF_INT) value = prefs.getIntPref(key); else if (type === prefs.PREF_STRING) value = prefs.getStringPref(key); } catch (_) {}
    return { type, user, value };
  };
  const restoreTyped = (key, snap) => {
    if (!snap || !snap.user) { try { prefs.clearUserPref(key); } catch (_) {} return; }
    if (snap.type === prefs.PREF_BOOL) prefs.setBoolPref(key, !!snap.value);
    else if (snap.type === prefs.PREF_INT) prefs.setIntPref(key, Math.round(Number(snap.value)));
    else if (snap.type === prefs.PREF_STRING) prefs.setStringPref(key, String(snap.value ?? ''));
  };
  const fixtureIDs = [];
  for (const value of Object.values(state.fixtures || {})) if (value?.id && !fixtureIDs.includes(value.id)) fixtureIDs.push(value.id);
  for (const id of state.runOwnedIDs || []) if (!fixtureIDs.includes(id)) fixtureIDs.push(id);
  const out = { step: 'cleanup-restore', fixtures: fixtureIDs, readersClosed: 0, erased: [], prefs: {}, dynamicRecords: null, positions: {}, transports: null, host: null, errors: null };

  // Close every run-owned reader, including any player, before erasing items.
  for (const id of fixtureIDs) {
    let reader = null;
    for (const candidate of Zotero.Reader?._readers || []) if (candidate?.itemID === id) reader = candidate;
    if (!reader) continue;
    try { reader._internalReader?.toggleReadAloudPopup(false); } catch (_) {}
    await sleep(250);
    try { reader.close?.(); } catch (_) {}
    await waitFor(() => !Zotero.Reader?._readers?.some?.(candidate => candidate?.itemID === id), 10000, 80);
    out.readersClosed++;
  }
  // Reader arrays can be compartment objects; verify by index as well.
  for (const id of fixtureIDs) {
    for (const candidate of Zotero.Reader?._readers || []) if (candidate?.itemID === id) { try { candidate.close?.(); } catch (_) {} }
    try {
      const item = Zotero.Items.get(id);
      if (item) { const key = item.key; await item.eraseTx(); try { prefs.clearUserPref(prefix + 'documentVoices.user/' + key); } catch (_) {} out.erased.push({ id, key, ok: true }); }
      else out.erased.push({ id, missing: true, ok: true });
    } catch (error) { out.erased.push({ id, error: String(error) }); }
  }
  if (out.erased.length !== fixtureIDs.length || out.erased.some(entry => entry.ok !== true)) throw new Error('fixture erase did not complete: ' + JSON.stringify(out.erased));

  // Keep every transport suspended while its test data is gone.
  for (const suffix of ['webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings']) prefs.setBoolPref(prefix + suffix, false);
  const transportIdle = await waitFor(async () => {
    try {
      const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
      const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
      const settings = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
      const upload = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
      return (position.store?.queued ?? 0) === 0 && position.store?.writing === false && position.store?.lastError === null
        && sync.transport?.running === false && sync.shared?.transport?.running === false
        && settings.transport?.pendingChange === false && settings.transport?.running === false && upload.autoUpload?.pending === false;
    } catch (_) { return false; }
  }, 20000, 150);
  out.transports = { idle: !!transportIdle };
  if (!transportIdle) throw new Error('WebDAV transports did not become idle before restore');
  const posBefore = (() => { try { return JSON.parse(state.positionBefore || 'null'); } catch (_) { return null; } })();
  let posAfter = null;
  try { posAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (_) {}
  out.positions = { beforeRows: posBefore?.database?.rows ?? null, afterRows: posAfter?.database?.rows ?? null, rowsBackToBaseline: posAfter?.database?.rows === (state.posBeforeRows ?? posBefore?.database?.rows ?? null), store: posAfter?.store ? { queued: posAfter.store.queued, writing: posAfter.store.writing, deletions: posAfter.store.deletions, lastError: posAfter.store.lastError } : null };

  // Restore all named settings while WebDAV remains off. Secrets are kept in
  // memory and reported only by length/user-value status.
  for (const [suffix, snap] of Object.entries(baseline.prefs || {})) {
    if (suffix.startsWith('webdav.')) continue;
    restoreTyped(prefix + suffix, snap);
    const now = readTyped(prefix + suffix);
    const secret = suffix.endsWith('.password') || suffix.endsWith('.username') || suffix.endsWith('.headers') || suffix.endsWith('.baseURL') || suffix === 'webdav.url' || suffix === 'webdav.syncState' || suffix === 'readAloud.memory';
    out.prefs[suffix] = secret ? { matchesValue: now.value === snap.value, matchesUser: now.user === snap.user, length: String(now.value || '').length } : { matchesValue: now.value === snap.value, matchesUser: now.user === snap.user, value: now.value };
  }
  for (const [suffix, snap] of Object.entries(baseline.providerSwitches || {})) {
    restoreTyped(prefix + suffix, snap);
    const now = readTyped(prefix + suffix);
    out.prefs[suffix] = { matchesValue: now.value === snap.value, matchesUser: now.user === snap.user, value: now.value };
  }

  // Dynamic per-document voice records are not part of the named prefs.
  const originalRecords = baseline.documentRecords || {};
  try {
    const branch = prefs.getBranch(prefix + 'documentVoices.');
    const children = branch.getChildList('', {});
    for (let i = 0; i < children.length; i++) {
      const suffix = 'documentVoices.' + children[i];
      if (!originalRecords[suffix]) { try { prefs.clearUserPref(prefix + suffix); } catch (_) {} }
    }
    for (const [suffix, snap] of Object.entries(originalRecords)) restoreTyped(prefix + suffix, snap);
    const after = {};
    const nowChildren = branch.getChildList('', {});
    for (let i = 0; i < nowChildren.length; i++) { const name = 'documentVoices.' + nowChildren[i]; const rec = readTyped(prefix + name); after[name] = { length: String(rec.value || '').length, user: rec.user }; }
    const recordMatches = Object.keys(originalRecords).length === Object.keys(after).length
      && Object.entries(originalRecords).every(([name, snap]) => {
        const current = readTyped(prefix + name);
        return current.user === snap.user && current.value === snap.value;
      });
    out.dynamicRecords = { expected: Object.fromEntries(Object.entries(originalRecords).map(([k,v]) => [k, { length: String(v.value || '').length, user: v.user }])), actual: after, matches: recordMatches };
    if (!recordMatches) throw new Error('dynamic document voice records were not restored exactly');
  } catch (error) { out.dynamicRecords = { error: String(error) }; }

  // Restore the native voice pref exactly before the plugin memory (memory is
  // the final pref write, per the workflow).
  restoreTyped(nativeKey, baseline.native);
  const nativeNow = readTyped(nativeKey);
  out.native = { matchesValue: nativeNow.value === baseline.native?.value, matchesUser: nativeNow.user === baseline.native?.user, length: String(nativeNow.value || '').length };
  const memorySnap = baseline.prefs?.['readAloud.memory'];
  if (memorySnap) restoreTyped(prefix + 'readAloud.memory', memorySnap);
  const memoryNow = readTyped(prefix + 'readAloud.memory');
  out.memory = { matchesValue: memoryNow.value === memorySnap?.value, matchesUser: memoryNow.user === memorySnap?.user, length: String(memoryNow.value || '').length };
  const namedPrefsMatch = Object.entries(out.prefs).every(([suffix, row]) => row.matchesUser && (row.matchesValue || suffix === 'readAloud.remainingTime'));
  if (!namedPrefsMatch || !out.native?.matchesValue || !out.native?.matchesUser || !out.memory?.matchesValue || !out.memory?.matchesUser || out.dynamicRecords?.matches !== true || out.positions?.rowsBackToBaseline !== true || !out.transports?.idle) {
    throw new Error('local cleanup verification failed; leaving WebDAV switches off: ' + JSON.stringify({ namedPrefsMatch, native: out.native, memory: out.memory, dynamicRecords: out.dynamicRecords, positions: out.positions, transports: out.transports }));
  }

  // Restore WebDAV destination and switches only after fixture data and all
  // temporary settings are gone. Then wait for any restored-state writes.
  for (const suffix of ['webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncState']) if (baseline.prefs?.[suffix]) restoreTyped(prefix + suffix, baseline.prefs[suffix]);
  for (const suffix of ['webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings']) if (baseline.prefs?.[suffix]) restoreTyped(prefix + suffix, baseline.prefs[suffix]);
  const finalIdle = await waitFor(async () => {
    try {
      const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
      const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
      const settings = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
      const upload = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
      return (position.store?.queued ?? 0) === 0 && position.store?.writing === false && sync.transport?.running === false && sync.shared?.transport?.running === false && settings.transport?.pendingChange === false && settings.transport?.running === false && upload.autoUpload?.pending === false;
    } catch (_) { return false; }
  }, 20000, 150);
  out.transports.finalIdle = !!finalIdle;
  if (!finalIdle) throw new Error('WebDAV transports did not become idle after original state restore');

  // Close any leftover settings dialog, restore host geometry, and leave the
  // host minimized as required for the owner's desktop.
  try { const win = Services.wm.getMostRecentWindow('zotero:pref'); if (win) win.close(); } catch (_) {}
  const host = Zotero.getMainWindow();
  const hb = state.isolation?.hostBefore;
  try { if (hb && host?.resizeTo) host.resizeTo(hb.outerWidth, hb.outerHeight); if (hb && host?.moveTo) host.moveTo(hb.screenX, hb.screenY); } catch (_) {}
  try { if (host?.minimize) host.minimize(); else if (host) host.windowState = 2; } catch (_) {}
  await sleep(700);
  out.host = { minimized: host?.windowState === 2, restoredBounds: !!hb };
  if (!out.host.minimized) throw new Error('Zotero host did not remain minimized after cleanup');
  if (!baseline.debugStoring && Zotero.Debug?.storing) try { Zotero.Debug.setStore(false); } catch (_) {}
  const errors = (Zotero.getErrors?.() || []).map(String);
  const pluginErrors = errors.filter(line => /zotero-tts|zotero-tts\.js/i.test(line));
  out.errors = { ringCount: errors.length, pluginCount: pluginErrors.length, pluginTail: pluginErrors.slice(0, 12).map(line => line.replace(/https?:\/\/[^\s)]+/g, '[url]')) };
  state.cleanup = out;
  return JSON.stringify(out, null, 1);
})()
