// The state this case touches, snapshotted into Zotero.ZoteroTTSRun.state.snapshot
// before anything is changed, and the mute (readAloud.volume 0) the workflow asks
// for before a player opens. readAloud.memory is only reported — a voice id with
// `::` is one of ours and spends no Zotero credit; the run stops if it is not.
// No pref is read in bulk and none of these can hold a key.
(async () => {
  const out = { step: 'baseline-and-mute' };
  const S = Zotero.ZoteroTTSRun.state;
  const NAMES = ['readAloud.volume', 'readAloud.joinSplitSentences', 'readAloud.restoreSkippedLines', 'readAloud.memory'];
  const snap = { prefs: {}, at: new Date().toISOString() };
  try {
    for (let i = 0; i < NAMES.length; i++) {
      const name = NAMES[i];
      const full = 'extensions.zotero.zotero-tts.' + name;
      snap.prefs[name] = { value: Zotero.Prefs.get('zotero-tts.' + name), userValue: Services.prefs.prefHasUserValue(full) };
    }
    const mem = snap.prefs['readAloud.memory'].value;
    let voiceId = null;
    try { voiceId = JSON.parse(String(mem)).voice.id; } catch (e) { voiceId = null; }
    out.memoryVoice = voiceId;
    out.memoryVoiceIsPlugin = typeof voiceId === 'string' && voiceId.indexOf('::') > 0;
    if (!out.memoryVoiceIsPlugin) throw new Error('readAloud.memory does not name a plugin voice (no "::"): ' + String(voiceId) + ' — opening a player would spend Zotero credit');
  } catch (e) { out.prefError = String(e); throw e; }
  try {
    snap.debugStoring = Zotero.Debug.storing;
    if (!snap.debugStoring) Zotero.Debug.setStore(true);
    out.debugStoringWas = snap.debugStoring;
  } catch (e) { out.debugError = String(e); }
  try {
    const win = Zotero.getMainWindow();
    snap.selectedTabID = win && win.Zotero_Tabs ? win.Zotero_Tabs.selectedID : null;
    out.selectedTabID = snap.selectedTabID;
  } catch (e) { out.tabError = String(e); }
  try {
    Zotero.Prefs.set('zotero-tts.readAloud.volume', 0);
    out.volumeNow = Zotero.Prefs.get('zotero-tts.readAloud.volume');
  } catch (e) { out.volumeError = String(e); }
  try {
    const rs = Zotero.Reader._readers || [];
    out.readersBefore = [];
    for (let i = 0; i < rs.length; i++) {
      const ir = rs[i]._internalReader;
      const m = ir && ir._readAloudManager;
      out.readersBefore.push({ i, itemID: rs[i].itemID, tabID: rs[i].tabID, active: m ? m.active : null, paused: m ? m.paused : null, segs: ir && ir._readAloudSegments ? ir._readAloudSegments.segments.length : null });
    }
  } catch (e) { out.readersError = String(e); }
  S.snapshot = snap;
  out.snapshotPrefs = Object.keys(snap.prefs).join(',');
  out.volumeWas = snap.prefs['readAloud.volume'];
  out.joinPrefWas = snap.prefs['readAloud.joinSplitSentences'];
  return JSON.stringify(out);
})()
