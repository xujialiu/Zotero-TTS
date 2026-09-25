// Baseline for item 5.9 (issue #143): startup identity, named prefs this
// case may touch (volume, memory), debug store on, owner readers left
// alone, and the position-store row count/legacyPref to prove nothing
// moves them. WebDAV isolation (URL swap + sync switches) runs outside
// this kit, once per zotero-dev session, per the workflow.
// params: none. state: writes baseline.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const getStr = (name, def) => { try { return Services.prefs.getStringPref(name, def); } catch (e) { return def; } };
  const getInt = (name, def) => { try { return Services.prefs.getIntPref(name, def); } catch (e) { return def; } };
  const hasUser = (name) => Services.prefs.prefHasUserValue(name);
  const read = (suffix, type) => {
    const full = prefix + suffix;
    const value = type === 'int' ? getInt(full, null) : getStr(full, null);
    return { value, user: hasUser(full) };
  };
  const snap = { 'readAloud.volume': read('readAloud.volume', 'int'), 'readAloud.memory': read('readAloud.memory', 'str') };
  state.baseline = { prefs: snap, debugStoring: !!Zotero.Debug?.storing };
  if (!Zotero.Debug?.storing) Zotero.Debug.setStore(true);

  // Mute before any playback-capable action (Shift+Space in script 03).
  Services.prefs.setIntPref(prefix + 'readAloud.volume', 0);
  state.baseline.muted = read('readAloud.volume', 'int');

  const memoryRaw = snap['readAloud.memory'].value || '';
  let memoryVoiceId = null;
  try { memoryVoiceId = JSON.parse(memoryRaw)?.voice?.id ?? null; } catch (e) { /* not JSON */ }
  state.baseline.memoryIsListedVoice = typeof memoryVoiceId === 'string' && memoryVoiceId.includes('::');

  const readers = [];
  const list = Zotero.Reader?._readers || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i]; if (!r) continue;
    const m = r._internalReader?._readAloudManager;
    readers.push({ itemID: r.itemID, active: !!m?.active, paused: !!m?.paused, type: r.type || null, isWindow: !!r._window && r._window !== Zotero.getMainWindow() });
  }
  state.baseline.readers = readers;

  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { position = { error: String(e) }; }
  state.baseline.startup = startup;
  state.baseline.positionRows = position?.database?.rows ?? null;
  state.baseline.legacyPref = position?.legacyPref ?? null;

  return JSON.stringify({
    startupOk: startup.failed.length === 0,
    startupFailed: startup.failed,
    version: startup.version,
    readers,
    memoryIsListedVoice: state.baseline.memoryIsListedVoice,
    volume: state.baseline.muted,
    positionRows: state.baseline.positionRows,
    legacyPref: state.baseline.legacyPref,
    debugStoring: !!Zotero.Debug?.storing,
  }, null, 1);
})()
