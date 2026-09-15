// Item 9 (issue #111), after the tester's own zotero_plugin_install with
// the SAME xpi (an in-place reinstall, not run from this script -- the
// bridge action happens between 08 and this one). Polls the surviving
// fixture tab for _internalReader/_readAloudManager to reappear
// (rulebook: <=7s polls, ~24s ceiling), re-reads providerTiers()/
// zoteroTiers() on it, diffs against 08's "before" snapshot, and checks
// the errors ring/debug log for a new dead-object burst. The settings
// window is stale after an in-place install (driving notes Sec1): closed
// and reopened fresh here to read the section's switches off a live pane
// rather than the old JS closures. Leaves the tab CLOSED and the settings
// window OPEN (on the fresh pane) at the end, for 10's cleanup.
// params: fixtureItemID. state: reads fixture (08).
(async () => {
  const out = { step: 'after-reload' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = Zotero.ZoteroTTSRun.params;
  try {
    const fixture = S.fixture;
    if (!fixture) throw new Error('state.fixture is missing -- run 08-before-reload.js first, and reinstall the xpi between 08 and this script');
    const itemID = fixture.itemID;

    let r = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      r = null;
      const rs = Zotero.Reader._readers || [];
      for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID && rs[i].tabID === fixture.tabID) r = rs[i];
      if (r && r._internalReader && r._internalReader._readAloudManager) break;
      await sleep(500);
    }
    out.readerSurvivedMs = Date.now() - t0;
    out.readerSurvived = !!(r && r._internalReader && r._internalReader._readAloudManager);
    if (!out.readerSurvived) throw new Error('the fixture reader/manager never reappeared after the reinstall within 30s');

    const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    out.providerTiersAfter = pt.readers.find((x) => x.title === fixture.title) || null;
    out.hiddenAfter = pt.hidden;
    const zt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.zoteroTiers());
    out.zoteroTiersAfter = { switches: zt.switches, hidden: zt.hidden };

    // --- Fresh settings window (driving notes Sec1: the old pane is stale
    // after an in-place install). ---
    const stale = Services.wm.getMostRecentWindow('zotero:pref');
    if (stale) {
      stale.close();
      const t1 = Date.now();
      while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t1 < 10000) await sleep(200);
    }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win = null;
    const t2 = Date.now();
    while (Date.now() - t2 < 15000) {
      win = Services.wm.getMostRecentWindow('zotero:pref');
      if (win && win.document.getElementById('ztts-openai-server')) break;
      await sleep(200);
    }
    if (!win) throw new Error('settings window never reappeared after the reinstall');
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const doc = win.document;
    const t3 = Date.now();
    while (!doc.getElementById('ztts-zotero-section') && Date.now() - t3 < 8000) await sleep(150);

    out.standardToggleLabel = doc.getElementById('ztts-enable-zotero-standard') ? doc.getElementById('ztts-enable-zotero-standard').getAttribute('label') : null;
    out.premiumToggleLabel = doc.getElementById('ztts-enable-zotero-premium') ? doc.getElementById('ztts-enable-zotero-premium').getAttribute('label') : null;
    out.standardPref = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    out.premiumPref = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');
    out.switchesMatchPrefs =
      out.standardToggleLabel === (out.standardPref ? 'Disable' : 'Enable') &&
      out.premiumToggleLabel === (out.premiumPref ? 'Disable' : 'Enable');

    // --- Errors: a new dead-object burst would be a regression (issue #5,
    // fixed in 1.8.3). Compare content, not just length (the ring rotates).
    const errsAfter = Zotero.getErrors(true) || [];
    out.errorsAfterCount = errsAfter.length;
    const deadObjectAfter = errsAfter.filter((e) => /can.t access dead object/i.test(String(e)));
    out.deadObjectErrorsAfter = deadObjectAfter.map(String);
    try {
      const log = await Zotero.Debug.get();
      const text = String(log);
      out.debugLengthAfter = text.length;
      const tail = text.slice(-20000);
      out.deadObjectMentionsInTail = (tail.match(/can.t access dead object/gi) || []).length;
      out.zteroTtsLinesInTail = (tail.match(/\[zotero-tts\]/g) || []).length;
    } catch (e) { out.debugLengthAfterError = String(e); }

    // --- Close the surviving tab now that it has been read. ---
    const mainWin = Zotero.getMainWindow();
    if (mainWin && mainWin.Zotero_Tabs && r.tabID) mainWin.Zotero_Tabs.close(r.tabID);
    const t4 = Date.now();
    while (Date.now() - t4 < 10000) {
      const rs = Zotero.Reader._readers || [];
      if (!rs.some((x) => x.tabID === r.tabID)) break;
      await sleep(150);
    }
    out.tabClosedAtEnd = !(Zotero.Reader._readers || []).some((x) => x.tabID === r.tabID);
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
