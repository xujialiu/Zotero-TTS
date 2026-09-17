return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, p = Services.prefs, PT = Components.interfaces.nsIPrefBranch;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fixtures = state.fixtures || {}, ids = [];
  for (const kind of ['pdf', 'epub']) if (fixtures[kind]?.itemID) ids.push(fixtures[kind].itemID);
  const closed = [], erased = [], errors = [];
  for (const id of ids) for (const reader of Zotero.Reader?._readers || []) if (reader?.itemID === id) {
    try { reader._internalReader?.toggleReadAloudPopup(false); } catch (e) { errors.push('popup ' + id + ': ' + String(e)); }
    try { const pending = reader.close?.(); if (pending?.then) await pending; closed.push({ id, tabID: reader.tabID }); } catch (e) { errors.push('close ' + id + ': ' + String(e)); }
  }
  for (let i = 0; i < 180; i++) { let present = false; for (const reader of Zotero.Reader?._readers || []) if (ids.includes(reader?.itemID)) present = true; if (!present) break; await sleep(50); }
  for (const id of ids) { try { const item = Zotero.Items.get(id); if (item) { await item.eraseTx(); erased.push({ id, erased: !Zotero.Items.get(id) }); } } catch (e) { errors.push('erase ' + id + ': ' + String(e)); } }
  const snapshots = { ...(state.positionShortcut?.fullSnapshot || {}) };
  // Baseline is captured before the shared setup mutes output. It is
  // authoritative for overlapping prefs; fullSnapshot may also carry the
  // shortcut-only prefs from the position-key recorder scripts.
  for (const name of Object.keys(state.baseline?.prefs || {})) snapshots[name] = state.baseline.prefs[name];
  const write = (name, saved) => {
    if (!saved?.user) { if (p.prefHasUserValue(name)) p.clearUserPref(name); return; }
    if (saved.type === PT.PREF_STRING) p.setStringPref(name, String(saved.value));
    else if (saved.type === PT.PREF_BOOL) p.setBoolPref(name, !!saved.value);
    else if (saved.type === PT.PREF_INT) p.setIntPref(name, Number(saved.value));
  };
  const memory = 'extensions.zotero.zotero-tts.readAloud.memory', voices = 'extensions.zotero.reader.readAloudVoices';
  for (const name of Object.keys(snapshots)) if (name !== memory && name !== voices) write(name, snapshots[name]);
  if (snapshots[voices]) write(voices, snapshots[voices]);
  if (snapshots[memory]) write(memory, snapshots[memory]);
  const baselineReader = state.baseline?.readers?.[0] || null;
  if (baselineReader?.tabID) { try { Zotero_Tabs.select(baselineReader.tabID); } catch (e) { errors.push('select owner: ' + String(e)); } }
  const settings = Services.wm.getMostRecentWindow('zotero:pref'); if (settings) { settings.close(); for (let i = 0; i < 100 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(50); }
  if (state.baseline?.debugStoring === false) { try { Zotero.Debug.setStore(false); } catch (e) { errors.push('debug restore: ' + String(e)); } }
  const host = Services.wm.getMostRecentWindow('navigator:browser'), target = state.host?.bounds || state.baseline?.host;
  if (host && target) { try { host.resizeTo?.(target.width ?? target.outerWidth, target.height ?? target.outerHeight); host.moveTo?.(target.x ?? target.screenX, target.y ?? target.screenY); } catch (e) {} await sleep(500); try { host.minimize?.(); } catch (e) {} for (let i = 0; i < 60 && host.windowState !== 2; i++) await sleep(50); }
  const safeRead = name => { const type = p.getPrefType(name), user = p.prefHasUserValue(name); let value = null; if (type === PT.PREF_STRING) value = { chars: p.getStringPref(name, '').length }; else if (type === PT.PREF_BOOL) value = p.getBoolPref(name, false); else if (type === PT.PREF_INT) value = p.getIntPref(name, 0); return { type, user, value }; };
  const prefAudit = {}, mismatches = [];
  for (const name of Object.keys(snapshots)) {
    const actual = safeRead(name), expected = snapshots[name], value = actual.type === PT.PREF_STRING ? p.getStringPref(name, '') : actual.value;
    prefAudit[name] = actual;
    if (actual.type !== expected.type || actual.user !== expected.user || (expected.type === PT.PREF_STRING ? value !== expected.value : actual.value !== expected.value)) mismatches.push(name);
  }
  const fixtureReaders = [], owner = [];
  for (const reader of Zotero.Reader?._readers || []) { const m = reader?._internalReader?._readAloudManager; if (ids.includes(reader?.itemID)) fixtureReaders.push(reader.itemID); if (baselineReader && reader.itemID === baselineReader.itemID && reader.tabID === baselineReader.tabID) owner.push({ itemID: reader.itemID, tabID: reader.tabID, active: !!m?.active, paused: !!m?.paused, popupOpen: !!m?.popupOpen || !!reader?._internalReader?._state?.readAloudState?.popupOpen, position: m?._controller?._position ?? null, voice: m?.selectedVoiceID || null }); }
  const audit = { closed, erased, errors, mismatches, fixtureReaders, prefAudit, owner, settingsOpen: !!Services.wm.getMostRecentWindow('zotero:pref'), selectedTabID: globalThis.Zotero_Tabs?.selectedID || null, host: host ? { windowState: host.windowState, outerWidth: host.outerWidth, outerHeight: host.outerHeight, screenX: host.screenX, screenY: host.screenY } : null, debugStoring: !!Zotero.Debug?.storing };
  if (errors.length || mismatches.length || fixtureReaders.length) throw new Error('cleanup failed: ' + JSON.stringify(audit));
  state.positionCleanup = audit;
  return JSON.stringify(audit, null, 1);
})()
