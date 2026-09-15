// Item 8, second half: run once zotero_plugin_install has reinstalled the
// same xpi in place (done from the harness between 07-voice-browser.js and
// this script -- a kit script cannot call the MCP bridge itself). Confirms
// startup() and the fixture reader's identity survived, that
// resolveShadow/createElementWrapped came back true, that live === total,
// scans the debug log for new "can't access dead object" lines added since
// params.logBeforeLength, then closes the fixture tab and confirms patches()
// drops both of its entries with no new error.
// params: logBeforeLength (the debug log's character length, captured just
// before the reinstall, by a direct zotero_execute_js call outside the kit --
// passing the whole log text through a param would be needlessly large).
// state: reads fixture, patchesBeforeReload; writes nothing further.
(async () => {
  const out = { step: 'after-reload-dispose' };
  const P = Zotero.ZoteroTTSRun.params;
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const fixture = S.fixture;
    if (!fixture) throw new Error('state.fixture is missing -- run 02-open-fixture-item1.js first');

    const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
    out.startupVersion = startup.version;
    out.startupFailed = startup.failed;

    let r = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 24000) {
      const rs = Zotero.Reader._readers || [];
      r = rs.find((x) => x.itemID === fixture.itemID) || null;
      if (r && r._internalReader && r._internalReader._readAloudManager) break;
      await sleep(300);
    }
    out.readerSurvived = !!(r && r._internalReader && r._internalReader._readAloudManager);
    if (!out.readerSurvived) throw new Error('the fixture reader did not survive the reinstall within 24 s');

    const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    const mine = pt.readers.find((x) => x.title === fixture.title);
    out.diagnosticsAfterReload = mine || null;

    const patchesAfterReload = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).providerTiers;
    out.patchesAfterReload = patchesAfterReload;
    out.patchesBeforeReload = S.patchesBeforeReload || null;
    out.liveEqualsTotalAfterReload = patchesAfterReload ? patchesAfterReload.live === patchesAfterReload.total : null;

    try {
      const logAfter = String(await Zotero.Debug.get());
      const fromLen = typeof P.logBeforeLength === 'number' ? P.logBeforeLength : 0;
      const added = logAfter.slice(fromLen);
      out.newDeadObjectLines = added.split('\n').filter((l) => l.includes("can't access dead object"));
      out.newDeadObjectCount = out.newDeadObjectLines.length;
    } catch (e) {
      out.debugError = String(e);
    }

    const mainWin = Zotero.getMainWindow();
    if (mainWin && mainWin.Zotero_Tabs && fixture.tabID) {
      mainWin.Zotero_Tabs.close(fixture.tabID);
      out.tabCloseCalled = true;
    } else {
      throw new Error('no main window / Zotero_Tabs / tabID to close the fixture tab');
    }
    await sleep(800);
    const stillOpen = (Zotero.Reader._readers || []).some((x) => x.itemID === fixture.itemID);
    out.fixtureTabStillOpen = stillOpen;

    const patchesAfterClose = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).providerTiers;
    out.patchesAfterClose = patchesAfterClose;
    out.totalDroppedByTwo = patchesAfterReload && patchesAfterClose ? patchesAfterReload.total - patchesAfterClose.total === 2 : null;

    try {
      const logAfterClose = String(await Zotero.Debug.get());
      out.newErrorsAfterClose = logAfterClose
        .split('\n')
        .slice(-40)
        .filter((l) => l.includes('[zotero-tts]') && /error/i.test(l));
    } catch (e) {
      out.debugAfterCloseError = String(e);
    }
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out);
})();
