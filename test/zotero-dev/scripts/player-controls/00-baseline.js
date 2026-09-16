return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state || (run.state = {}), p = Services.prefs;
  const names = [
    'extensions.zotero.zotero-tts.readAloud.volume',
    'extensions.zotero.zotero-tts.readAloud.memory',
    'extensions.zotero.zotero-tts.readAloud.favoriteVoices',
    'extensions.zotero.zotero-tts.readAloud.favoritesOnly',
    'extensions.zotero.zotero-tts.readAloud.usePluginPlayer',
    'extensions.zotero.zotero-tts.readAloud.playerLayout',
    'extensions.zotero.zotero-tts.readAloud.openExpanded',
    'extensions.zotero.zotero-tts.readAloud.globalSpeed',
    'extensions.zotero.zotero-tts.webdav.syncPositions',
    'extensions.zotero.zotero-tts.webdav.autoUploadSettings',
    'extensions.zotero.zotero-tts.webdav.syncSettings',
    'extensions.zotero.reader.readAloudVoices',
  ];
  const read = name => {
    const type = p.getPrefType(name), user = p.prefHasUserValue(name); let value = null;
    try {
      if (type === p.PREF_STRING) value = p.getStringPref(name);
      else if (type === p.PREF_BOOL) value = p.getBoolPref(name);
      else if (type === p.PREF_INT) value = p.getIntPref(name);
    } catch (e) { value = null; }
    return { type, user, value };
  };
  const prefs = {};
  for (let i = 0; i < names.length; i++) prefs[names[i]] = read(names[i]);
  const readers = [];
  for (const r of Zotero.Reader?._readers || []) {
    if (!r) continue;
    let title = null;
    try { const item = Zotero.Items.get(r.itemID), parent = item?.parentItem ? Zotero.Items.get(item.parentItem) : item; title = parent?.getField('title') || null; } catch (e) {}
    const ir = r._internalReader, m = ir?._readAloudManager, frame = ir?._iframeWindow?.document?.getElementById('ztts-player-frame');
    readers.push({ itemID: r.itemID, tabID: r.tabID, title, type: r.type || null, active: !!m?.active, paused: !!m?.paused,
      popupOpen: !!m?.popupOpen || !!ir?._state?.readAloudState?.popupOpen, position: m?._controller?._position ?? null,
      voice: m?.selectedVoiceID || null, tier: m?._selectedTier || null, layout: frame?.getAttribute('data-layout') || null });
  }
  const errors = Zotero.getErrors?.();
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  state.baseline = { prefs, readers, selectedTabID: globalThis.Zotero_Tabs?.selectedID || null,
    host: host ? { windowState: host.windowState ?? null, outerWidth: host.outerWidth ?? null, outerHeight: host.outerHeight ?? null,
      innerWidth: host.innerWidth ?? null, innerHeight: host.innerHeight ?? null, screenX: host.screenX ?? null, screenY: host.screenY ?? null } : null,
    settingsOpen: !!Services.wm.getMostRecentWindow('zotero:pref'), debugStoring: !!Zotero.Debug?.storing,
    errors: Array.isArray(errors) ? errors.map(String) : [String(errors ?? '')] };
  if (!state.baseline.debugStoring) Zotero.Debug.setStore(true);
  const write = (name, value, type = p.getPrefType(name)) => {
    if (type === p.PREF_STRING) p.setStringPref(name, String(value));
    else if (type === p.PREF_BOOL) p.setBoolPref(name, !!value);
    else if (type === p.PREF_INT) p.setIntPref(name, Math.round(Number(value)));
  };
  write('extensions.zotero.zotero-tts.readAloud.volume', 0);
  for (const name of ['extensions.zotero.zotero-tts.webdav.syncPositions', 'extensions.zotero.zotero-tts.webdav.autoUploadSettings', 'extensions.zotero.zotero-tts.webdav.syncSettings']) write(name, false);
  const prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  if (prefWin) {
    prefWin.close();
    for (let i = 0; i < 120 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await new Promise(resolve => setTimeout(resolve, 50));
  }
  const shown = {};
  for (const name of names) {
    const value = read(name);
    shown[name] = /readAloud\.memory$|reader\.readAloudVoices$/.test(name)
      ? { type: value.type, user: value.user, present: typeof value.value === 'string' && value.value.length > 0, chars: typeof value.value === 'string' ? value.value.length : null }
      : value;
  }
  return JSON.stringify({ selectedTabID: state.baseline.selectedTabID, settingsOpen: state.baseline.settingsOpen, host: state.baseline.host,
    readers, prefs: shown, muted: read(names[0]), syncGuard: names.slice(8, 11).map(read), debugStoring: !!Zotero.Debug?.storing }, null, 1);
})()
