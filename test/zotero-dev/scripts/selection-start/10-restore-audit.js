return (async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const baseline = state.baseline;
  if (!baseline?.prefs) throw new Error('baseline is missing');
  const p = Services.prefs;
  const defaults = p.getDefaultBranch('');
  const write = (name, saved) => {
    if (!saved?.user) {
      if (p.prefHasUserValue(name)) p.clearUserPref(name);
      return;
    }
    const value = saved.value;
    if (saved.type === p.PREF_BOOL) p.setBoolPref(name, !!value);
    else if (saved.type === p.PREF_INT) p.setIntPref(name, Number(value));
    else if (saved.type === p.PREF_STRING) p.setStringPref(name, String(value));
  };
  const names = Object.keys(baseline.prefs);
  const volume = names.find(name => name.endsWith('.readAloud.volume'));
  const voices = names.find(name => name.endsWith('.reader.readAloudVoices'));
  const memory = names.find(name => name.endsWith('.readAloud.memory'));
  const sync = names.filter(name => /webdav\.(syncPositions|autoUploadSettings|syncSettings)$/.test(name));
  if (volume) write(volume, baseline.prefs[volume]);
  for (const name of names) if (name !== volume && name !== voices && name !== memory && !sync.includes(name)) write(name, baseline.prefs[name]);
  if (voices) write(voices, baseline.prefs[voices]);
  if (memory) write(memory, baseline.prefs[memory]);
  for (const name of sync) write(name, baseline.prefs[name]);
  if (baseline.selectedTabID) for (const reader of Zotero.Reader._readers || []) if (reader?.tabID === baseline.selectedTabID) { Zotero_Tabs.select(baseline.selectedTabID); break; }
  if (baseline.settingsOpen && !Services.wm.getMostRecentWindow('zotero:pref')) {
    try { Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top'); } catch (e) {}
    for (let i = 0; i < 80 && !Services.wm.getMostRecentWindow('zotero:pref'); i++) await new Promise(resolve => setTimeout(resolve, 50));
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  const read = name => {
    const type = p.getPrefType(name);
    const user = p.prefHasUserValue(name);
    let value = null;
    try {
      if (type === p.PREF_BOOL) value = p.getBoolPref(name);
      else if (type === p.PREF_INT) value = p.getIntPref(name);
      else if (type === p.PREF_STRING) value = p.getStringPref(name);
    } catch (e) {}
    return { type, user, value };
  };
  const restored = {};
  for (const name of names) {
    const current = read(name);
    restored[name] = name.endsWith('.memory') || name.endsWith('.reader.readAloudVoices')
      ? { type: current.type, user: current.user, present: current.value !== null, chars: typeof current.value === 'string' ? current.value.length : null }
      : current;
  }
  const ownerRestoration = [];
  for (const before of baseline.readers || []) {
    let current = null;
    for (const reader of Zotero.Reader._readers || []) {
      if (reader?.itemID === before.itemID) { current = reader; break; }
    }
    const ir = current?._internalReader;
    const manager = ir?._readAloudManager;
    const now = current ? { itemID: current.itemID, key: before.key, tabID: current.tabID, active: !!manager?.active, paused: !!manager?.paused, popupOpen: !!ir?._state?.readAloudState?.popupOpen, position: Number.isFinite(manager?._controller?._position) ? manager._controller._position : null, voice: manager?.selectedVoiceID ?? null, tier: manager?._selectedTier ?? null } : null;
    ownerRestoration.push({ before, now, equal: !!now && ['itemID', 'tabID', 'active', 'paused', 'popupOpen', 'position', 'voice', 'tier'].every(key => now[key] === before[key]) });
  }
  if (!baseline.debugStoring) try { Zotero.Debug.setStore(false); } catch (e) {}
  let selectionStart = null;
  try { selectionStart = JSON.parse(Zotero.ZoteroTTS.diagnostics.selectionStart()); } catch (e) { selectionStart = { error: String(e) }; }
  return JSON.stringify({ restored, ownerRestoration, ownersPass: ownerRestoration.every(row => row.equal), selectedTabID: globalThis.Zotero_Tabs?.selectedID ?? null, settingsOpen: !!Services.wm.getMostRecentWindow('zotero:pref'), debugStoring: !!Zotero.Debug?.storing, selectionStart });
})()
