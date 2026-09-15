// Item 7 (issue #111): "Everything off." No player open. Disables both
// Zotero tiers and every provider the baseline (00) found enabled --on
// this profile that is only Fish Audio-- through their own Enable/Disable
// buttons, checks the voice browser's status line and #ztts-voices-tiers,
// opens the fixture fresh (memory voice fish::... still resolves the ::
// guard even though fish is now off) to read providerTiers() (empty
// tiers, Zotero's own three greyed options) and the errors ring, then
// restores every switch through Enable -- a provider whose check fails on
// the way back is left off and reported, per the brief.
// params: fixtureItemID. state: reads baseline.providers (00) for the
// enabled-before list; writes nothing new.
(async () => {
  const out = { step: 'everything-off' };
  const S = Zotero.ZoteroTTSRun.state;
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
    // With nothing enabled this converges on the empty/fallback reading
    // itself, which is what item 7 wants to observe.
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
  async function clickAndWaitSettled(doc, id, maxMs, desired) {
    // `desired` names the INTENDED end state (false for the disable
    // phase, true for the restore phase) rather than just flipping
    // whatever is currently there -- found the hard way this run: with
    // Premium already off (06's guard-driven disable landed a beat after
    // 06's own script had stopped watching it), this function's old
    // "always flip" behavior clicked it from off TO ON mid-"everything
    // off", since it only ever computed the target as !prefBefore. A
    // switch already at its desired state is left untouched (no click),
    // reported skipped.
    const toggle = doc.getElementById('ztts-enable-' + id);
    if (!toggle) return { error: 'no toggle for ' + id };
    const before = toggle.getAttribute('label');
    const prefBefore = Zotero.Prefs.get('zotero-tts.' + id + '.enabled');
    if (typeof desired === 'boolean' && prefBefore === desired) {
      return { before, after: before, ms: 0, sawChecking: false, resultText: null, pref: prefBefore, skipped: true };
    }
    const targetPref = typeof desired === 'boolean' ? desired : !prefBefore;
    toggle.click();
    const t0 = Date.now();
    let label = before;
    let sawChecking = false;
    // Break once the pref reaches the target (a genuine on->off is
    // synchronous-ish, an off->on check can take ~1-2.5s); if the target
    // is never reached (a failed Enable check leaves the pref at its old
    // value), fall back to "Checking... was seen, then cleared" so a
    // real failure still ends the loop instead of spinning the full
    // budget. A bare "label is not Checking" break -- with no minimum
    // condition -- races the click and can end the loop on the frame
    // before anything changed (found the hard way, see 05's own note).
    while (Date.now() - t0 < maxMs) {
      label = toggle.getAttribute('label');
      if (/checking/i.test(label || '')) sawChecking = true;
      if (Zotero.Prefs.get('zotero-tts.' + id + '.enabled') === targetPref) break;
      if (sawChecking && label && !/checking/i.test(label)) break;
      await sleep(150);
    }
    const result = doc.getElementById('ztts-test-result-' + id);
    return { before, after: label, ms: Date.now() - t0, sawChecking, resultText: result ? result.textContent : null, pref: Zotero.Prefs.get('zotero-tts.' + id + '.enabled') };
  }

  let h = null;
  try {
    const itemID = P.fixtureItemID;
    if (!itemID) throw new Error('params.fixtureItemID is required');
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 01-pane-structure.js first');
    const doc = win.document;

    const enabledProvidersBefore = S.baseline && S.baseline.providers
      ? Object.keys(S.baseline.providers).filter((id) => S.baseline.providers[id].value === true)
      : [];
    out.enabledProvidersBefore = enabledProvidersBefore;
    out.zoteroStandardBefore = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    out.zoteroPremiumBefore = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');

    const toDisable = [...enabledProvidersBefore, 'zotero-standard', 'zotero-premium'];
    out.disableResults = {};
    for (const id of toDisable) out.disableResults[id] = await clickAndWaitSettled(doc, id, 15000, false);

    await sleep(500);
    const status = doc.getElementById('ztts-voices-status');
    const tiersList = doc.getElementById('ztts-voices-tiers');
    out.voicesStatusAfterAllOff = status ? status.textContent : null;
    out.voicesTiersChildCountAfterAllOff = tiersList ? tiersList.children.length : null;

    // --- Open the fixture: providerTiers() with nothing enabled. ---
    h = await openFixturePausedFresh(itemID);
    let fixtureTitle = null;
    try { fixtureTitle = Zotero.Items.get(itemID).getField('title'); } catch (e) { /* ignore */ }
    const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    const fixtureEntry = pt.readers.find((x) => x.title === fixtureTitle) || null;
    out.fixtureTiersEmpty = fixtureEntry ? fixtureEntry.tiers : null;
    out.fixtureOptions = fixtureEntry ? fixtureEntry.options : null;
    out.allOptionsDisabled = fixtureEntry && fixtureEntry.options ? fixtureEntry.options.every((o) => o.disabled === true) : null;
    out.voicesLengthWithNothingOn = h.m.voices.length;

    const errsAfter = Zotero.getErrors(true) || [];
    out.errorsAfterLastTwo = errsAfter.slice(-2).map(String);
    out.errorsAfterCount = errsAfter.length;

    await closeFixtureTab(h.win, h.tabID);
    h = null;

    // --- Restore every switch through Enable. ---
    out.restoreResults = {};
    for (const id of toDisable) out.restoreResults[id] = await clickAndWaitSettled(doc, id, 20000, true);
    out.restoreFailed = toDisable.filter((id) => out.restoreResults[id].pref !== true);
    if (out.restoreFailed.length) out.restoreFailedNote = 'left off, reported: ' + out.restoreFailed.join(', ') + ' -- see restoreResults for the message';

    await sleep(500);
    out.voicesStatusAfterRestore = doc.getElementById('ztts-voices-status') ? doc.getElementById('ztts-voices-status').textContent : null;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    try { if (h) await closeFixtureTab(h.win, h.tabID); } catch (e2) { /* ignore */ }
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
