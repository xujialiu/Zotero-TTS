// Cleanup: closes/erases whatever fixture item is still around (fixture-a is
// already gone after item 3; fixture-b's tab is still open, paused, from item
// 5), then restores every pref this case touched to its baseline value AND
// user-value state -- prefetch, prefetchEnabled, local.enabled, local.baseURL,
// extensions.zotero.reader.readAloudVoices (a fixture rewrites its "en"
// entry), readAloud.volume, and readAloud.memory LAST, byte-identical to
// 00's snapshot -- restores Debug.storing and the selected tab, and reports
// the error ring so the run's own report can compare it against 00's
// baseline. Safe to run again: every step no-ops on an already-clean state.
// params: none. state: reads baseline, fixtures.
(async () => {
  const out = { step: 'cleanup-restore', closed: [], erased: [] };
  const S = Zotero.ZoteroTTSRun.state;
  const PREFIX = 'extensions.zotero.zotero-tts.';
  const RAV_KEY = 'extensions.zotero.reader.readAloudVoices';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const fixtures = S.fixtures || {};
    for (const k of Object.keys(fixtures)) {
      const f = fixtures[k];
      if (!f || f.itemID == null) continue;
      try {
        const rs = Zotero.Reader._readers || [];
        let r = null;
        for (let i = 0; i < rs.length; i++) if (rs[i].itemID === f.itemID) r = rs[i];
        if (r) {
          try { r._internalReader.toggleReadAloudPopup(false); } catch (e) { /* may already be closed */ }
          await sleep(200);
          const win = Zotero.getMainWindow();
          if (win && win.Zotero_Tabs && r.tabID) win.Zotero_Tabs.close(r.tabID);
          await sleep(400);
          out.closed.push(k);
        }
      } catch (e) { out.closeError = (out.closeError || '') + ' ' + k + ':' + String(e); }
      try {
        const item = Zotero.Items.get(f.itemID);
        if (item) { await item.eraseTx(); out.erased.push(k); }
        else { out.erased.push(k + ':already-gone'); }
      } catch (e) { out.eraseError = (out.eraseError || '') + ' ' + k + ':' + String(e); }
    }

    await sleep(300);
    out.itemsStillThere = [];
    for (const k of Object.keys(fixtures)) {
      const f = fixtures[k];
      if (!f || f.itemID == null) continue;
      const still = await Zotero.Items.getAsync(f.itemID).catch(() => null);
      if (still) out.itemsStillThere.push(k);
    }
    out.allErased = out.itemsStillThere.length === 0;

    const baseline = S.baseline;
    if (baseline && baseline.prefs) {
      // Every pref but memory first, in no particular order; memory last.
      // mimo.enabled is a no-op unless 00b-mimo-override.js ran this run.
      const order = ['prefetch', 'prefetchEnabled', 'local.enabled', 'local.baseURL', 'mimo.enabled', 'readAloud.volume', 'readAloud.memory'];
      out.prefs = {};
      for (const name of order) {
        const rec = baseline.prefs[name];
        if (!rec) continue;
        const full = PREFIX + name;
        try {
          if (rec.userValue) Zotero.Prefs.set('zotero-tts.' + name, rec.value);
          else if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full);
          const nowValue = Zotero.Prefs.get('zotero-tts.' + name);
          const nowUser = Services.prefs.prefHasUserValue(full);
          out.prefs[name] = { restored: nowValue === rec.value && nowUser === rec.userValue, value: nowValue, userValue: nowUser };
        } catch (e) { out.prefs[name] = { error: String(e) }; }
      }

      const rav = baseline.readerReadAloudVoices;
      if (rav && typeof rav.value === 'string') {
        try {
          if (rav.userValue) Services.prefs.setStringPref(RAV_KEY, rav.value);
          else if (Services.prefs.prefHasUserValue(RAV_KEY)) Services.prefs.clearUserPref(RAV_KEY);
          const nowValue = Services.prefs.getStringPref(RAV_KEY, '');
          out.readerReadAloudVoicesRestored = nowValue === rav.value;
        } catch (e) { out.readerReadAloudVoicesRestoreError = String(e); }
      }

      try {
        if (baseline.debugStoringWas === false && Zotero.Debug.storing) Zotero.Debug.setStore(false);
        out.debugStoringNow = Zotero.Debug.storing;
        out.debugStoringWanted = baseline.debugStoringWas;
      } catch (e) { out.debugError = String(e); }

      try {
        if (baseline.selectedTabID) {
          const win = Zotero.getMainWindow();
          if (win && win.Zotero_Tabs) { win.Zotero_Tabs.select(baseline.selectedTabID); out.selectedTab = win.Zotero_Tabs.selectedID; }
        }
      } catch (e) { out.tabError = String(e); }
    } else {
      out.prefsRestoreNote = 'no baseline in state -- nothing restored; read 00 result file on disk directly';
    }

    const lateResultsFinal = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    out.lateResultsFinal = lateResultsFinal;
    out.lateResultsTotalRise = lateResultsFinal.dropped - (baseline ? baseline.lateResultsAtStart.dropped : 0);

    const errs = Zotero.getErrors(true) || [];
    out.errorRingCountFinal = errs.length;

    const readers = Zotero.Reader._readers || [];
    out.readersFinal = readers.map((r) => ({ itemID: r.itemID }));
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
