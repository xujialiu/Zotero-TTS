// Cleanup: close both fixture readers' find/selection/session, erase the
// fixtures, confirm position rows back to baseline, restore every touched
// pref (memory last, byte-identical using the FULL value 01-baseline kept
// in state), scan the debug store for [zotero-tts]/dead-object lines, then
// restore Debug.storing and the window to its baseline bounds (minimized
// last, by the caller, per the workflow's own exception).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const state = Zotero.ZoteroTTSRun.state;
  const host = Zotero.getMainWindow();
  const PREFIX = 'zotero-tts.';
  const FULL = (k) => 'extensions.zotero.' + PREFIX + k;
  const get = (k) => Zotero.Prefs.get(PREFIX + k);
  const hasUser = (k) => { try { return Services.prefs.prefHasUserValue(FULL(k)); } catch (e) { return null; } };
  const restore = (k, snap) => {
    if (snap.hasUser) Zotero.Prefs.set(PREFIX + k, snap.value);
    else { try { Services.prefs.clearUserPref(FULL(k)); } catch (e) {} }
    return { key: k, nowValue: get(k), nowHasUser: hasUser(k), matchesValue: get(k) === snap.value, matchesHasUser: hasUser(k) === snap.hasUser };
  };

  const report = { readers: {} };

  for (const kind of Object.keys(state.fixtures)) {
    const itemID = state.fixtures[kind].itemID;
    const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === itemID);
    if (!reader) { report.readers[kind] = { found: false }; continue; }
    const ir = reader._internalReader;
    try { ir.toggleFindPopup({ primary: true, open: false }); } catch (e) {}
    try { ir.toggleFindPopup({ primary: false, open: false }); } catch (e) {}
    try { Components.utils.waiveXrays(ir._primaryView)._setSelectionRanges(undefined); } catch (e) {}
    try { ir.disableSplitView(); } catch (e) {}
    const m = ir._readAloudManager;
    if (m && m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    try { ir.toggleReadAloudPopup(false); } catch (e) {}
    const closed = await wait(() => !ir._readAloudManager?.active ? true : null, 8000);
    try { host.Zotero_Tabs.close(reader.tabID); } catch (e) {}
    report.readers[kind] = { found: true, closedActive: closed };
  }
  await sleep(300);
  report.readersRemainingForFixtures = (Zotero.Reader._readers || []).filter((r) => Object.values(state.fixtures).some((f) => f.itemID === r.itemID)).length;

  for (const kind of Object.keys(state.fixtures)) {
    const it = Zotero.Items.get(state.fixtures[kind].itemID);
    if (it) await it.eraseTx();
  }

  const posAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  report.posBeforeRows = state.posBeforeRows;
  report.posAfterRows = posAfter && posAfter.database ? posAfter.database.rows : null;
  report.rowsBackToBaseline = report.posAfterRows === report.posBeforeRows;

  // Debug store scan, before turning it back off.
  const debugText = await Zotero.Debug.get();
  const lines = String(debugText || '').split('\n');
  const zttsLines = lines.filter((l) => l.includes('[zotero-tts]') || l.includes('zotero-tts.js'));
  const deadObjectLines = lines.filter((l) => l.includes("can't access dead object"));
  report.debug = { totalLines: lines.length, zttsLineCount: zttsLines.length, zttsSample: zttsLines.slice(0, 5), deadObjectCount: deadObjectLines.length };

  // Prefs: restore in order, memory last, byte-identical.
  const results = {};
  results['readAloud.volume'] = restore('readAloud.volume', state.baseline['readAloud.volume']);
  results['readAloud.playerLayout'] = restore('readAloud.playerLayout', state.baseline['readAloud.playerLayout']);
  results['readAloud.usePluginPlayer'] = restore('readAloud.usePluginPlayer', state.baseline['readAloud.usePluginPlayer']);
  results['readAloud.autoScrollMode'] = restore('readAloud.autoScrollMode', state.baseline['readAloud.autoScrollMode']);
  results['readAloud.keepFollowingWhileVisible'] = restore('readAloud.keepFollowingWhileVisible', state.baseline['readAloud.keepFollowingWhileVisible']);
  const memSnap = state.baseline['readAloud.memory'];
  const memFull = state.readAloudMemoryFullValue;
  if (memSnap.hasUser) Zotero.Prefs.set(PREFIX + 'readAloud.memory', memFull);
  else { try { Services.prefs.clearUserPref(FULL('readAloud.memory')); } catch (e) {} }
  const memNow = get('readAloud.memory');
  results['readAloud.memory'] = { matchesValue: memNow === memFull, matchesHasUser: hasUser('readAloud.memory') === memSnap.hasUser, byteIdentical: memNow === memFull };

  // Debug store back to its baseline (off).
  Zotero.Debug.setStore(false);
  report.debugStoringRestored = Zotero.Debug.storing === false;

  // Owner reader untouched, still present.
  const ownerStill = (Zotero.Reader._readers || []).find((r) => r.itemID === 20420);
  report.ownerReader = ownerStill ? { present: true, active: !!ownerStill._internalReader?._readAloudManager?.active, paused: !!ownerStill._internalReader?._readAloudManager?.paused } : { present: false };

  report.prefResults = results;
  report.settingsWindowOpen = !!Services.wm.getMostRecentWindow('zotero:pref');
  return JSON.stringify(report, null, 1);
})();
