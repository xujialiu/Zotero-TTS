// Cleanup: restore the four pause prefs and the volume to the 142-01
// baseline (byte-exact, hasUserValue included), confirm readAloud.memory
// was never touched, close the fixture's player/tab (toggleReadAloudPopup
// (false), never a bare deactivate -- workflow rule), erase the fixture,
// confirm the reading-position rows are back to baseline.
// params: none. state: reads baseline, fixtures, posBeforeRows,
// readAloudMemoryFullValue; writes cleanup.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'cleanup' };
  const PREFIX = 'zotero-tts.';
  const FULL = (k) => 'extensions.zotero.' + PREFIX + k;
  const get = (k) => Zotero.Prefs.get(PREFIX + k);
  const set = (k, v) => Zotero.Prefs.set(PREFIX + k, v);
  const hasUser = (k) => { try { return Services.prefs.prefHasUserValue(FULL(k)); } catch (e) { return null; } };

  const baseline = S.baseline || {};
  const prefKeys = [
    'readAloud.sentenceDelayEnabled', 'readAloud.sentenceDelayMs',
    'readAloud.paragraphDelayEnabled', 'readAloud.paragraphDelayMs',
    'readAloud.volume',
  ];
  const restored = {};
  for (const k of prefKeys) {
    const snap = baseline[k];
    if (!snap) { restored[k] = { skipped: true }; continue; }
    if (snap.hasUser) set(k, snap.value);
    else { try { Services.prefs.clearUserPref(FULL(k)); } catch (e) {} }
    restored[k] = { value: get(k), hasUser: hasUser(k), matchesValue: get(k) === snap.value, matchesHasUser: hasUser(k) === snap.hasUser };
  }
  out.prefsRestored = restored;
  out.allPrefsMatch = Object.values(restored).every((r) => r.skipped || (r.matchesValue && r.matchesHasUser));

  // readAloud.memory: never touched by this run -- confirm byte-identical
  const memoryNow = get('readAloud.memory');
  out.memoryUntouched = memoryNow === S.readAloudMemoryFullValue;

  // Close and erase the one fixture this run opened (brief: "one reader tab
  // on the kit's fixture")
  const ids = Object.keys(S.fixtures || {}).map((k) => S.fixtures[k].itemID).filter(Boolean);
  for (const itemID of ids) {
    let r = null;
    for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
    if (r) {
      try { r._internalReader.toggleReadAloudPopup(false); } catch (e) {}
      await sleep(200);
      try { r._window.Zotero_Tabs.close(r.tabID); } catch (e) {}
    }
  }
  await sleep(500);
  let left = 0;
  for (const itemID of ids) for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) left++;
  out.readersLeftOpen = left;

  for (const itemID of ids) {
    try {
      const item = Zotero.Items.get(itemID);
      if (item) await item.eraseTx();
    } catch (e) {
      out.eraseError = (out.eraseError || []).concat(String(e));
    }
  }

  const posAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  out.posAfterRows = posAfter && posAfter.database ? posAfter.database.rows : null;
  out.posBeforeRows = S.posBeforeRows;
  out.rowsBackToBaseline = out.posAfterRows === out.posBeforeRows;

  S.cleanup = out;
  return JSON.stringify(out, null, 1);
})();
