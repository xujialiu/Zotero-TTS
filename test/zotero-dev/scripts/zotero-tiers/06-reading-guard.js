// Item 6 (issue #111): "The reading guard." Opens the fixture fresh and
// leaves its popup OPEN (paused is enough -- active&&paused counts as
// "reading" to the guard). Clicks Disable beside Premium on the pane:
// expects the ztts-notice dialog (ui/reading-guard.ts openNotice), reads
// its message, confirms the pref/button did NOT move yet, then presses
// "Stop reading and continue" -- the switch should go through and the
// player should stop. Restores: Enable Premium the same way item 5 tested
// Standard's Enable. Leaves the tab CLOSED and both tiers ON at the end,
// for 07.
// params: fixtureItemID. state: none written.
(async () => {
  const out = { step: 'reading-guard' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = Zotero.ZoteroTTSRun.params;

  async function openFixturePausedFresh(itemID) {
    const memoryVoice = (() => {
      try { return JSON.parse(Zotero.Prefs.get('zotero-tts.readAloud.memory') || '{}').voice; } catch (e) { return null; }
    })();
    const memoryVoiceID = memoryVoice && memoryVoice.id ? String(memoryVoice.id) : null;
    // A metered Zotero voice (no ::) is EXPECTED here once an earlier item
    // in this case has picked one -- this whole case is explicitly about
    // Zotero's voices (rulebook: "...unless the item is about Zotero's
    // voices", which A3-A7 are), so it is never refused; the pause-loop
    // below still catches the session within ~50ms of it opening. Found
    // the hard way: an earlier version of this guard threw here once item
    // 4 had picked a Standard voice, blocking every later reopen in this
    // kit even though playing it briefly, then pausing, is authorized.
    const memoryVoiceMetered = memoryVoiceID ? !memoryVoiceID.includes('::') : null;
    await Zotero.Reader.open(itemID);
    let r = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      r = null;
      const rs = Zotero.Reader._readers || [];
      for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID) r = rs[i];
      if (r && r._internalReader && r._internalReader._readAloudManager) break;
      await sleep(300);
    }
    if (!r) throw new Error('reader never appeared for item ' + itemID);
    const mainWin = Zotero.getMainWindow();
    if (mainWin && mainWin.Zotero_Tabs && r.tabID) mainWin.Zotero_Tabs.select(r.tabID);
    const ir = r._internalReader;
    const m = Components.utils.waiveXrays(ir._readAloudManager);
    await ir.toggleReadAloudPopup(true);
    const t1 = Date.now();
    while (Date.now() - t1 < 60000) {
      if (m.active && !m.paused) { try { m.pause(); } catch (e) { /* ignore */ } }
      if (m.active && m.paused) break;
      await sleep(50);
    }
    // Settle: see 03-disable-standard.js's comment -- the catalog's async
    // fetch can still be running when the pause-loop above exits; poll
    // providerTiers() until options/tiers stop changing before returning.
    let settleTitle = null;
    try { settleTitle = Zotero.Items.get(itemID).getField('title'); } catch (e) { /* ignore */ }
    let settleLastKey = null;
    let settleStableSince = null;
    const tSettle = Date.now();
    while (Date.now() - tSettle < 6000) {
      let mine = null;
      try {
        const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
        mine = pt.readers.find((x) => x.title === settleTitle) || null;
      } catch (e) { /* try again */ }
      const key = JSON.stringify(mine ? { tiers: mine.tiers, options: mine.options } : null);
      if (key === settleLastKey) {
        if (settleStableSince !== null && Date.now() - settleStableSince >= 400) break;
        if (settleStableSince === null) settleStableSince = Date.now();
      } else {
        settleLastKey = key;
        settleStableSince = Date.now();
      }
      await sleep(250);
    }

    return { r, ir, m, win: mainWin, tabID: r.tabID, memoryVoiceID, memoryVoiceMetered };
  }
  async function closeFixtureTab(win, tabID) {
    if (win && win.Zotero_Tabs && tabID) win.Zotero_Tabs.close(tabID);
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      const rs = Zotero.Reader._readers || [];
      if (!rs.some((x) => x.tabID === tabID)) break;
      await sleep(150);
    }
  }

  let h = null;
  try {
    const itemID = P.fixtureItemID;
    if (!itemID) throw new Error('params.fixtureItemID is required');

    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 01-pane-structure.js first');
    const doc = win.document;

    h = await openFixturePausedFresh(itemID);
    out.fixtureActive = h.m.active;
    out.fixturePaused = h.m.paused;
    out.fixtureTitle = h.r ? (Zotero.Items.get(itemID).getField('title')) : null;

    out.prefBefore = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');
    const toggle = doc.getElementById('ztts-enable-zotero-premium');
    out.toggleLabelBefore = toggle.getAttribute('label');

    toggle.click();
    let dialog = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      dialog = doc.getElementById('ztts-notice');
      if (dialog) break;
      await sleep(100);
    }
    out.dialogAppeared = !!dialog;
    if (!dialog) throw new Error('the reading-guard dialog never appeared');

    const bodyDivs = Array.from(dialog.querySelectorAll('div'));
    out.dialogText = bodyDivs.map((d) => d.textContent).filter(Boolean);
    out.dialogNamesFixture = out.dialogText.some((t) => out.fixtureTitle && t.includes(out.fixtureTitle));

    out.prefWhileDialogOpen = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');
    out.toggleLabelWhileDialogOpen = toggle.getAttribute('label');

    const buttons = Array.from(dialog.querySelectorAll('button'));
    out.buttonLabels = buttons.map((b) => b.textContent);
    const stopButton = buttons.find((b) => /stop reading and continue/i.test(b.textContent));
    if (!stopButton) throw new Error('the Stop reading and continue button was not found among ' + JSON.stringify(out.buttonLabels));
    stopButton.click();

    // A single clean click resolves fast (measured live: dialog gone by
    // ~110ms, the write follows at once for Disable or after Enable's own
    // ~600-700ms check) -- but a fixed 500ms sleep here raced that on one
    // run and read the dialog still open/pref unmoved; worse, the SAME
    // toggle's still-stale label then drew a stray SECOND click from the
    // "restore" step below, which -- since refuseWhileReading was still
    // mid-flight -- opened a SECOND #ztts-notice on top of the first
    // (found live: two simultaneous dialog[id="ztts-notice"] nodes,
    // getElementById only ever seeing the first, both stuck for 15s+).
    // Poll for real settlement (dialog gone AND the pref actually moved)
    // before reading state or clicking anything else.
    const tStop = Date.now();
    while (Date.now() - tStop < 10000) {
      const stillDialog = doc.getElementById('ztts-notice');
      const pref = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');
      if (!stillDialog && pref === false) break;
      await sleep(100);
    }
    out.stopSettleMs = Date.now() - tStop;
    out.prefAfterStop = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');
    out.toggleLabelAfterStop = toggle.getAttribute('label');
    out.fixtureActiveAfterStop = h.m.active;
    out.dialogGoneAfterStop = !doc.getElementById('ztts-notice');
    out.strayDialogCount = doc.querySelectorAll('dialog[id="ztts-notice"]').length;
    if (out.strayDialogCount > 0) throw new Error('a #ztts-notice dialog is still open ' + out.stopSettleMs + 'ms after Stop reading and continue -- see prefAfterStop/toggleLabelAfterStop');

    // --- Restore: Enable Premium, item 5's way. ---
    const toggle2 = doc.getElementById('ztts-enable-zotero-premium');
    const result2 = doc.getElementById('ztts-test-result-zotero-premium');
    toggle2.click();
    const t1 = Date.now();
    let sawChecking2 = false;
    // Break on the pref reaching true, or (a failed check) on "Checking..."
    // having been seen and then cleared -- never on a bare "label is not
    // Checking" with no minimum condition, which races the click (05's
    // kit comment has the story this was found from).
    while (Date.now() - t1 < 20000) {
      const label = toggle2.getAttribute('label');
      if (/checking/i.test(label || '')) sawChecking2 = true;
      if (Zotero.Prefs.get('zotero-tts.zotero-premium.enabled') === true) break;
      if (sawChecking2 && label && !/checking/i.test(label)) break;
      await sleep(150);
    }
    out.restorePrefAfter = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');
    out.restoreToggleLabelAfter = toggle2.getAttribute('label');
    out.restoreResultText = result2 ? result2.textContent : null;
    if (out.restorePrefAfter !== true) throw new Error('could not restore Premium to enabled -- see restoreResultText');

    // The tab the guard stopped may or may not still exist as a reader
    // entry (playerStop closes the popup, not necessarily the tab) --
    // close it explicitly so 07 starts with no player open.
    const rs = Zotero.Reader._readers || [];
    const stillThere = rs.find((x) => x.itemID === itemID);
    if (stillThere) await closeFixtureTab(h.win, stillThere.tabID);
    out.tabClosedAtEnd = !(Zotero.Reader._readers || []).some((x) => x.itemID === itemID);
    h = null;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    try {
      if (h) {
        const rs = Zotero.Reader._readers || [];
        const stillThere = rs.find((x) => x.itemID === Zotero.ZoteroTTSRun.params.fixtureItemID);
        if (stillThere) await closeFixtureTab(h.win, stillThere.tabID);
      }
    } catch (e2) { /* ignore */ }
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
