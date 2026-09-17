return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const names = [
    'local.enabled', 'local.baseURL', 'local.engine', 'local.voice', 'local.headers',
    'fish.enabled', 'fish.freeOnly', 'fish.voices',
    'readAloud.memory', 'readAloud.favoriteVoices', 'readAloud.favoritesOnly', 'readAloud.sameForAllDocuments',
    'readAloud.volume', 'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings',
    'reader.readAloudVoices',
  ];
  const full = name => name === 'reader.readAloudVoices'
    ? 'extensions.zotero.reader.readAloudVoices' : prefix + name;
  const get = name => {
    const key = full(name), type = p.getPrefType(key), user = p.prefHasUserValue(key);
    let value = null;
    try {
      if (type === p.PREF_BOOL) value = p.getBoolPref(key);
      else if (type === p.PREF_INT) value = p.getIntPref(key);
      else if (type === p.PREF_STRING) value = p.getStringPref(key);
    } catch {}
    return { key, type, user, value };
  };
  const safe = value => typeof value === 'string'
    ? { present: value.length > 0, chars: value.length }
    : value;
  const read = name => {
    const item = get(name);
    // No secret preference is included in this result. Headers and the
    // remembered voice are kept in memory only for restoration.
    if (/headers$/i.test(name)) return { key: item.key, type: item.type, user: item.user, value: safe(item.value) };
    if (/memory|Voices|favoriteVoices/i.test(name)) return { key: item.key, type: item.type, user: item.user, value: safe(item.value) };
    return item;
  };
  const baseline = {};
  const raw = {};
  for (const name of names) { baseline[name] = read(name); raw[name] = get(name); }
  state.baseline = { prefs: raw, closedOwners: [], selectedTabID: globalThis.Zotero_Tabs?.selectedID ?? null };

  // Preserve the host geometry/selection, but the workflow leaves it
  // minimized for bridge-only checks.
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  state.host = host ? {
    windowState: host.windowState,
    bounds: { x: host.screenX, y: host.screenY, width: host.outerWidth, height: host.outerHeight },
    selectedTabID: globalThis.Zotero_Tabs?.selectedID ?? null,
  } : null;
  if (host && host.windowState !== 2) { try { host.minimize(); } catch {} }

  // Keep the debug store as the evidence for new plugin errors.
  state.debugStoring = !!Zotero.Debug?.storing;
  if (!state.debugStoring) { try { Zotero.Debug.setStore(true); } catch {} }

  // A player left by the owner is allowed to be closed when the guard needs
  // provider/list changes. Record the title/state and never reopen it.
  for (const reader of Zotero.Reader._readers || []) {
    const ir = reader?._internalReader, m = ir?._readAloudManager;
    if (!ir || !m?.active) continue;
    let title = null;
    try { const item = Zotero.Items.get(reader.itemID); title = item?.parentItem?.title || item?.getField?.('title') || null; } catch {}
    const before = { itemID: reader.itemID, tabID: reader.tabID, title, paused: !!m.paused, voice: m.selectedVoiceID || null };
    try { ir.toggleReadAloudPopup(false); } catch (e) { throw new Error('could not close owner player: ' + String(e)); }
    await new Promise(resolve => setTimeout(resolve, 250));
    if (m.active) throw new Error('owner player remained active after close: ' + JSON.stringify(before));
    state.baseline.closedOwners.push(before);
  }

  // Sync/backup switches are disabled before any temporary preference edit.
  const syncKeys = ['webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings'];
  for (const name of syncKeys) {
    const key = full(name);
    if (p.getPrefType(key) === p.PREF_BOOL && p.getBoolPref(key)) p.setBoolPref(key, false);
  }
  const volumeKey = full('readAloud.volume');
  if (p.getPrefType(volumeKey) === p.PREF_INT && p.getIntPref(volumeKey) !== 0) p.setIntPref(volumeKey, 0);

  let startup = null;
  try { startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup()); } catch (e) { throw new Error('startup diagnostic threw: ' + String(e)); }
  if (!startup || startup.failed?.length || startup.steps?.some(step => !step.ok)) {
    throw new Error('startup diagnostic failed: ' + JSON.stringify(startup));
  }
  state.startup = startup;
  return JSON.stringify({
    status: 'PASS', version: startup.version, steps: startup.steps?.length ?? null,
    failed: startup.failed ?? [], hostBefore: state.host, minimized: host ? host.windowState === 2 : null,
    closedOwnerPlayers: state.baseline.closedOwners,
    prefs: baseline,
  }, null, 1);
})()
