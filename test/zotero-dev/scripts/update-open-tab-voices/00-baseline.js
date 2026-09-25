// Baseline for issue #131 (a tab open across an update keeps building its
// voice list). Zotero/reader state, the error ring and debug store, position
// rows, and a byte-exact snapshot (value, hasUserValue, declared type) of
// every pref this case touches -- restored in the kit's cleanup script,
// readAloud.memory last. Applies the run's own state once the snapshot is
// safely captured: readAloud.volume muted to 0. readAloud.memory already
// named a listed (fish::) voice on this profile -- recorded, not changed.
// zotero-standard.enabled (the switch items 1-4 flip) is only snapshotted
// here; the case's own scripts flip it. WebDAV url/username/password and
// the sync/backup switches are handled entirely outside this kit (workflow
// "Test WebDAV first"); this script never reads or writes them.
// params: none. state: baseline (snapshot object, see readPref shape).
(async () => {
  const out = { step: 'baseline' };
  const S = Zotero.ZoteroTTSRun.state;
  const Ci = Components.interfaces;
  function readPref(fullName) {
    const type = Services.prefs.getPrefType(fullName);
    const hasUserValue = Services.prefs.prefHasUserValue(fullName);
    let value = null;
    try {
      if (type === Services.prefs.PREF_STRING) value = Services.prefs.getStringPref(fullName, '');
      else if (type === Services.prefs.PREF_INT) value = Services.prefs.getIntPref(fullName, 0);
      else if (type === Services.prefs.PREF_BOOL) value = Services.prefs.getBoolPref(fullName, false);
    } catch (e) { value = 'ERR:' + e; }
    return { key: fullName, type, hasUserValue, value };
  }
  function writePref(fullName, type, value) {
    if (type === Services.prefs.PREF_STRING) Services.prefs.setStringPref(fullName, String(value));
    else if (type === Services.prefs.PREF_INT) Services.prefs.setIntPref(fullName, value);
    else if (type === Services.prefs.PREF_BOOL) Services.prefs.setBoolPref(fullName, !!value);
    else throw new Error('cannot write pref of type ' + type + ' at ' + fullName);
  }
  const P = 'extensions.zotero.zotero-tts.';
  try {
    out.zoteroVersion = Zotero.version;
    const readers = Zotero.Reader._readers || [];
    out.readersBefore = readers.map((r) => {
      let title = null;
      try {
        const item = Zotero.Items.get(r.itemID);
        const parent = item && item.parentItem ? item.parentItem : item;
        title = parent ? parent.getField('title') : null;
      } catch (e) { title = 'ERR:' + e; }
      const ir = r._internalReader;
      const m = ir && ir._readAloudManager;
      return {
        itemID: r.itemID, title,
        popupOpen: !!(ir && ir._state && ir._state.readAloudState && ir._state.readAloudState.popupOpen),
        active: !!(m && m.active), paused: m ? !!m.paused : null,
      };
    });

    // A stray settings window keeps the OLD pane's references across the
    // several reinstalls this case needs (workflow section 1); this case
    // never reads the pane, so it is simply closed, not reopened.
    const prefWin = Services.wm.getMostRecentWindow('zotero:pref');
    out.settingsWindowOpenBefore = !!prefWin;
    if (prefWin) prefWin.close();

    const errs = Zotero.getErrors(true) || [];
    out.errorsBefore = { count: errs.length, lastTwo: errs.slice(-2).map(String) };
    const arr = Services.console.getMessageArray() || [];
    const deadBaseline = [];
    for (let i = 0; i < arr.length; i++) {
      let se = null;
      try { se = arr[i].QueryInterface(Ci.nsIScriptError); } catch (e) { se = null; }
      const msg = (se && se.errorMessage) || arr[i].message || '';
      if (/can't access dead object/i.test(String(msg))) deadBaseline.push({ timeStamp: se ? se.timeStamp : null, columnNumber: se ? se.columnNumber : null });
      if (/list is undefined/i.test(String(msg))) deadBaseline.push({ timeStamp: se ? se.timeStamp : null, columnNumber: se ? se.columnNumber : null, note: 'pre-existing list-is-undefined (should not exist)' });
    }
    out.consoleTotalBefore = arr.length;
    out.deadOrTargetBaselineCount = deadBaseline.length;

    out.debugStoringBefore = Zotero.Debug.storing;
    S.debugStoringBefore = out.debugStoringBefore;
    Zotero.Debug.setStore(true);
    out.debugStoringNow = Zotero.Debug.storing;

    const posBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    out.positionRowsBefore = posBefore.database.rows;

    const baseline = {
      volume: readPref(P + 'readAloud.volume'),
      memory: readPref(P + 'readAloud.memory'),
      zoteroStandardEnabled: readPref(P + 'zotero-standard.enabled'),
    };
    out.baseline = baseline;
    out.memoryNamesListedVoice = (() => { try { return String(JSON.parse(baseline.memory.value).voice.id).includes('::'); } catch (e) { return null; } })();
    out.fishEnabled = readPref(P + 'fish.enabled').value;
    out.systemEnabled = readPref(P + 'system.enabled').value;

    // Apply the run's own state now that the snapshot is safely captured.
    writePref(baseline.volume.key, baseline.volume.type, 0);
    out.volumeNow = readPref(baseline.volume.key).value;

    out.deadBaseline = deadBaseline;
    S.deadBaseline = deadBaseline;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  S.baseline = out.baseline || null;
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
