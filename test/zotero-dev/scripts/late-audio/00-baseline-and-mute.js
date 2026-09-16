// Baseline for issue #116's late-audio case. Snapshots every pref this case
// touches (value + user-value state, including mimo.enabled for 00b below),
// the console's PRE-EXISTING dead-object entries (by timeStamp+columnNumber,
// so a later step reports only what it produced), the debug store's on/off
// state and current length, and diagnostics.patches().lateResults at the
// start of the run. Then applies the run's own state: readAloud.volume -> 0,
// local (Kokoro) temporarily enabled (configured -- baseURL and a header
// token already set -- but off), and readAloud.memory pointed at
// local::af_bella so opening a player is accepted without falling back to a
// Zotero-metered voice and spends nothing (Kokoro is free). Everything here
// is restored byte-exact by 90-cleanup-restore.js, memory last.
//
// Kokoro on this h200 deployment answers fast when its GPU is idle (live,
// this run: getVoices() 0.3-3 s, but getAudio() well under 300 ms even for a
// 132-char segment -- too fast to catch in flight at all, on any of five
// attempts including two with a guaranteed-cold cache after an in-place
// reinstall). When that happens, run 00b-mimo-override.js right after this
// one, before 01/03, to switch to Xiaomi MiMo (paid per request, several
// seconds live) for just those two items -- see their own headers.
// params: none. state: baseline (prefs snapshot, ring baseline, debug/tab state).
(async () => {
  const out = { step: 'baseline-and-mute' };
  const S = Zotero.ZoteroTTSRun.state;
  const PREFIX = 'extensions.zotero.zotero-tts.';
  const RAV_KEY = 'extensions.zotero.reader.readAloudVoices';
  const Ci = Components.interfaces;
  try {
    const names = ['readAloud.volume', 'readAloud.memory', 'prefetch', 'prefetchEnabled', 'local.enabled', 'local.baseURL', 'mimo.enabled'];
    const prefs = {};
    for (const n of names) {
      const full = PREFIX + n;
      prefs[n] = { value: Zotero.Prefs.get('zotero-tts.' + n), userValue: Services.prefs.prefHasUserValue(full) };
    }
    const rav = { value: Services.prefs.getStringPref(RAV_KEY, ''), userValue: Services.prefs.prefHasUserValue(RAV_KEY) };
    const debugStoringWas = Zotero.Debug.storing;
    if (!debugStoringWas) Zotero.Debug.setStore(true);
    const win = Zotero.getMainWindow();
    const selectedTabID = win && win.Zotero_Tabs ? win.Zotero_Tabs.selectedID : null;

    // The console's existing dead-object entries -- baseline, so a later
    // script reports only what IT produced. Matched by timeStamp+column,
    // never by ring length (Services.console never clears on its own; the
    // rulebook notes six pre-existing entries from 2026-09-15/16).
    const arr = Services.console.getMessageArray() || [];
    const deadBaseline = [];
    for (let i = 0; i < arr.length; i++) {
      let se = null;
      try { se = arr[i].QueryInterface(Ci.nsIScriptError); } catch (e) { se = null; }
      const msg = (se && se.errorMessage) || arr[i].message || '';
      if (/can't access dead object/i.test(String(msg))) deadBaseline.push({ timeStamp: se ? se.timeStamp : null, columnNumber: se ? se.columnNumber : null });
    }

    const lateResultsAtStart = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    const debugLenAtStart = (await Zotero.Debug.get()).length;

    S.baseline = { prefs, readerReadAloudVoices: rav, debugStoringWas, selectedTabID, consoleTotalBefore: arr.length, deadBaseline, lateResultsAtStart, debugLenAtStart };
    S.fixtures = {};

    // --- Apply the run's own state. ---
    Zotero.Prefs.set('zotero-tts.readAloud.volume', 0);
    if (!prefs['local.enabled'].value) Zotero.Prefs.set('zotero-tts.local.enabled', true);
    const memory = JSON.stringify({ speed: 1, voice: { id: 'local::af_bella', lang: 'en' } });
    Zotero.Prefs.set('zotero-tts.readAloud.memory', memory);

    out.volumeNow = Zotero.Prefs.get('zotero-tts.readAloud.volume');
    out.localEnabledNow = Zotero.Prefs.get('zotero-tts.local.enabled');
    out.memoryNow = Zotero.Prefs.get('zotero-tts.readAloud.memory');
    out.prefetchNow = { count: Zotero.Prefs.get('zotero-tts.prefetch'), enabled: Zotero.Prefs.get('zotero-tts.prefetchEnabled') };
    out.debugStoringWas = debugStoringWas;
    out.debugStoringNow = Zotero.Debug.storing;
    out.consoleDeadBaselineCount = deadBaseline.length;
    out.lateResultsAtStart = lateResultsAtStart;
    out.readersOpen = (Zotero.Reader._readers || []).length;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
