(async () => {
  const fixtureID = Zotero.ZoteroTTSRun.state.fixtureItemID;
  const prefix = 'extensions.zotero.zotero-tts.';
  const baseline = Zotero.ZoteroTTSRun.state.baseline;
  const cleanup = { errors: [], readerClosed: false, fixtureErased: false, settingsClosed: false };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const closeFixture = async () => {
    const readers = Zotero.Reader._readers || [];
    for (let i = 0; i < readers.length; i++) {
      if (readers[i].itemID !== fixtureID) continue;
      try {
        const pending = readers[i].close();
        if (pending && typeof pending.then === 'function') await pending;
        cleanup.readerClosed = true;
      } catch (e) { cleanup.errors.push('close: ' + String(e)); }
    }
    for (let i = 0; i < 40; i++) {
      let found = false;
      const now = Zotero.Reader._readers || [];
      for (let j = 0; j < now.length; j++) if (now[j].itemID === fixtureID) { found = true; break; }
      if (!found) return;
      await wait(100);
    }
    cleanup.errors.push('fixture reader remained after close polling');
  };
  try { await closeFixture(); } catch (e) { cleanup.errors.push('close phase: ' + String(e)); }
  try {
    const item = fixtureID ? Zotero.Items.get(fixtureID) : null;
    if (item) { await item.eraseTx(); cleanup.fixtureErased = true; }
    else cleanup.errors.push('fixture item missing before erase');
  } catch (e) { cleanup.errors.push('erase: ' + String(e)); }

  const restore = suffix => {
    const entry = baseline?.prefs?.[suffix];
    if (!entry) { cleanup.errors.push('missing baseline: ' + suffix); return; }
    const full = prefix + suffix;
    try {
      if (!entry.user) {
        if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full);
      } else if (typeof entry.value === 'boolean') Services.prefs.setBoolPref(full, entry.value);
      else if (typeof entry.value === 'number' && Number.isInteger(entry.value)) Services.prefs.setIntPref(full, entry.value);
      else if (typeof entry.value === 'string') Services.prefs.setStringPref(full, entry.value);
      else cleanup.errors.push('unsupported baseline type: ' + suffix);
    } catch (e) { cleanup.errors.push('restore ' + suffix + ': ' + String(e)); }
  };
  // Restore temporary values before re-enabling automatic sync/backup. Memory is last.
  for (const suffix of ['readAloud.volume', 'readAloud.stripAngleBrackets', 'readAloud.bracketPairs', 'cacheAudio', 'prefetchEnabled', 'fish.enabled', 'fish.freeOnly', 'webdav.syncSettings']) restore(suffix);
  restore('webdav.syncPositions');
  restore('webdav.autoUploadSettings');
  if (baseline) {
    try { Zotero.Debug.setStore(!!baseline.debugStoring); } catch (e) { cleanup.errors.push('restore debug store: ' + String(e)); }
  }
  restore('readAloud.memory');
  await wait(300);

  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win && !baseline?.settingsWindowOpen) {
      win.close();
      for (let i = 0; i < 30; i++) {
        if (!Services.wm.getMostRecentWindow('zotero:pref')) { cleanup.settingsClosed = true; break; }
        await wait(100);
      }
    } else cleanup.settingsClosed = !win || !!baseline?.settingsWindowOpen;
  } catch (e) { cleanup.errors.push('settings close: ' + String(e)); }

  const read = suffix => {
    const value = Zotero.Prefs.get('zotero-tts.' + suffix);
    return {
      value: suffix === 'readAloud.memory' ? undefined : value,
      valueKind: typeof value,
      valueSet: value != null,
      user: Services.prefs.prefHasUserValue(prefix + suffix),
      matchesBaseline: baseline?.prefs?.[suffix] ? value === baseline.prefs[suffix].value && Services.prefs.prefHasUserValue(prefix + suffix) === baseline.prefs[suffix].user : false,
    };
  };
  const finalPrefs = {};
  for (const suffix of ['readAloud.volume', 'readAloud.stripAngleBrackets', 'readAloud.bracketPairs', 'cacheAudio', 'prefetchEnabled', 'fish.enabled', 'fish.freeOnly', 'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings', 'readAloud.memory']) finalPrefs[suffix] = read(suffix);
  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { position = { error: String(e) }; }
  const readers = [];
  const list = Zotero.Reader._readers || [];
  for (let i = 0; i < list.length; i++) {
    const manager = list[i]._internalReader && list[i]._internalReader._readAloudManager;
    readers.push({ itemID: list[i].itemID, active: !!manager?.active, paused: manager ? !!manager.paused : null, voice: manager?.selectedVoiceID || null, tier: manager?._selectedTier || null });
  }
  const expectedReaders = (baseline?.readers || []).map(reader => ({ itemID: reader.itemID, active: reader.active, paused: reader.paused, voice: reader.selectedVoiceID || null, tier: reader.selectedTier || null }));
  let fixtureExists = false;
  try { fixtureExists = fixtureID ? !!Zotero.Items.get(fixtureID) : false; } catch (e) { fixtureExists = false; }
  return JSON.stringify({
    cleanup,
    fixtureExists,
    fixtureReadersRemaining: readers.filter(reader => reader.itemID === fixtureID).length,
    readers,
    readersMatchBaseline: JSON.stringify(readers) === JSON.stringify(expectedReaders),
    finalPrefs,
    debugStoring: !!Zotero.Debug.storing,
    settingsWindowOpen: !!Services.wm.getMostRecentWindow('zotero:pref'),
    position: { rows: position?.database?.rows ?? null, queued: position?.store?.queued ?? null, lastError: position?.store?.lastError ?? null },
  }, null, 1);
})()
