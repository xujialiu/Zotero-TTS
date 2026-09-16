return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, h = state.helpers, baseline = state.baseline;
  const p = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const out = { closed: [], erased: [], restored: false, errors: null };
  const fixtures = state.fixtures || {};
  for (const kind of ['pdf', 'epubScrolled', 'epubPaginated']) {
    const slot = fixtures[kind];
    let reader = h?.reader(slot) || null;
    let popupError = null, closeError = null;
    if (reader) {
      try { reader._internalReader?.toggleReadAloudPopup(false); } catch (e) { popupError = String(e); }
      try { reader.close?.(); } catch (e) { closeError = String(e); }
      for (let i = 0; i < 180; i++) {
        let present = false;
        for (const candidate of Zotero.Reader._readers || []) if (candidate?.itemID === slot.itemID && candidate?.tabID === reader.tabID) { present = true; break; }
        if (!present) break;
        await sleep(50);
      }
    }
    let left = 0;
    for (const candidate of Zotero.Reader._readers || []) if (candidate?.itemID === slot?.itemID) left++;
    if (slot) slot.reader = null;
    out.closed.push({ kind, itemID: slot?.itemID ?? null, tabID: reader?.tabID ?? null, popupError, closeError, left });
  }
  for (const kind of ['pdf', 'epubScrolled', 'epubPaginated']) {
    const id = fixtures[kind]?.itemID;
    let error = null, erased = false;
    try { const item = id ? Zotero.Items.get(id) : null; if (item) await item.eraseTx(); erased = !Zotero.Items.get(id); } catch (e) { error = String(e); }
    out.erased.push({ kind, itemID: id ?? null, erased, error });
  }
  const defaults = p.getDefaultBranch('');
  const write = (name, saved) => {
    if (!saved?.user) { if (p.prefHasUserValue(name)) p.clearUserPref(name); return; }
    if (saved.type === p.PREF_BOOL) p.setBoolPref(name, !!saved.value);
    else if (saved.type === p.PREF_INT) p.setIntPref(name, Number(saved.value));
    else if (saved.type === p.PREF_STRING) p.setStringPref(name, String(saved.value));
  };
  if (baseline?.prefs) {
    const names = Object.keys(baseline.prefs);
    const volume = names.find(name => name.endsWith('.readAloud.volume'));
    const voices = names.find(name => name.endsWith('.reader.readAloudVoices'));
    const memory = names.find(name => name.endsWith('.readAloud.memory'));
    const mode = names.find(name => name.endsWith('.readAloud.autoScrollMode'));
    const sync = names.filter(name => /webdav\.(syncPositions|autoUploadSettings|syncSettings)$/.test(name));
    if (volume) write(volume, baseline.prefs[volume]);
    for (const name of names) if (name !== volume && name !== voices && name !== memory && name !== mode && !sync.includes(name)) write(name, baseline.prefs[name]);
    if (voices) write(voices, baseline.prefs[voices]);
    if (memory) write(memory, baseline.prefs[memory]);
    if (mode) write(mode, baseline.prefs[mode]);
    for (const name of sync) write(name, baseline.prefs[name]);
    out.restored = true;
  }
  if (baseline?.selectedTabID) {
    for (const reader of Zotero.Reader._readers || []) if (reader?.tabID === baseline.selectedTabID) { try { Zotero_Tabs.select(baseline.selectedTabID); } catch (e) {} break; }
  }
  if (baseline?.settingsOpen && !Services.wm.getMostRecentWindow('zotero:pref')) {
    try { Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top'); } catch (e) { out.settingsOpenError = String(e); }
    for (let i = 0; i < 120 && !Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(50);
  }
  await sleep(700);
  if (baseline && !baseline.debugStoring) try { Zotero.Debug.setStore(false); } catch (e) {}
  const readSafe = name => {
    const type = p.getPrefType(name), user = p.prefHasUserValue(name);
    let value = null;
    try { if (type === p.PREF_BOOL) value = p.getBoolPref(name); else if (type === p.PREF_INT) value = p.getIntPref(name); else if (type === p.PREF_STRING) value = p.getStringPref(name); } catch (e) {}
    return /readAloud\.memory$|reader\.readAloudVoices$/.test(name) ? { type, user, present: value !== null, chars: typeof value === 'string' ? value.length : null } : { type, user, value };
  };
  const prefs = {};
  for (const name of Object.keys(baseline?.prefs || {})) prefs[name] = readSafe(name);
  const errors = (Zotero.getErrors?.() || []).map(String);
  const old = baseline?.errors || [];
  const relevant = value => /zotero-tts|dead object/i.test(value);
  out.errors = { baselineCount: old.length, currentCount: errors.length, newRelevant: errors.filter(value => relevant(value) && !old.includes(value)).map(value => value.slice(0, 260)), debugStoring: !!Zotero.Debug?.storing };
  const ownerRestoration = [];
  for (const before of baseline?.readers || []) {
    let current = null;
    for (const reader of Zotero.Reader._readers || []) {
      try { if (reader?.itemID === before.itemID && reader?.tabID === before.tabID) { current = reader; break; } } catch (e) {}
    }
    let tab = null;
    for (const candidate of Zotero_Tabs?._tabs || []) {
      try { if (candidate?.id === before.tabID) { tab = candidate; break; } } catch (e) {}
    }
    let now = null;
    try {
      const ir = current?._internalReader, manager = ir?._readAloudManager;
      now = current ? { itemID: current.itemID, tabID: current.tabID, tabType: tab?.type ?? 'reader', active: !!manager?.active, paused: !!manager?.paused, popupOpen: !!ir?._state?.readAloudState?.popupOpen, position: Number.isFinite(manager?._controller?._position) ? manager._controller._position : null, voice: manager?.selectedVoiceID ?? null, tier: manager?._selectedTier ?? null } : { itemID: before.itemID, tabID: before.tabID, tabType: tab?.type ?? null, tabItemID: tab?.data?.itemID ?? null };
    } catch (e) { now = { error: String(e) }; }
    const unloaded = !current && tab?.type === 'reader-unloaded' && tab?.data?.itemID === before.itemID;
    const loadedEqual = !!current && ['itemID', 'tabID', 'active', 'paused', 'popupOpen', 'position', 'voice', 'tier'].every(key => now[key] === before[key]);
    ownerRestoration.push({ before, now, equal: loadedEqual || unloaded });
  }
  out.ownerRestoration = ownerRestoration;
  out.ownersPass = ownerRestoration.every(row => row.equal);
  let patches = null;
  try { patches = JSON.parse(Zotero.ZoteroTTS.diagnostics.patches()); } catch (e) { patches = { error: String(e) }; }
  const fixtureAudit = {};
  for (const kind of Object.keys(fixtures)) {
    const id = fixtures[kind]?.itemID ?? null;
    let exists = false;
    try { exists = !!id && !!Zotero.Items.get(id); } catch (e) {}
    fixtureAudit[kind] = { itemID: id, exists };
  }
  return JSON.stringify({ out, prefs, selectedTabID: globalThis.Zotero_Tabs?.selectedID ?? null, settingsOpen: !!Services.wm.getMostRecentWindow('zotero:pref'), fixtures: fixtureAudit, patches });
})()
