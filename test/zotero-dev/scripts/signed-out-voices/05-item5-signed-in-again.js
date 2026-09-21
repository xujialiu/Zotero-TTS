// Item 5 (issue #130): "Signed in again, as before." Restores the fixture
// tab's OWN flag with Zotero's own setter
// (setLoggedIn(Zotero.Sync.Runner.enabled) -- true on this profile),
// reopens the popup and pauses at once (usePluginPlayer is already back to
// its baseline true, from item 4's own restore), settles, then checks
// liveVoiceList() asked:true/remote:true and providerTiers() signedIn:true
// with BOTH Zotero tiers back beside the providers; the debug output is
// checked ONLY from a length offset taken just before THIS open, so item
// 1's "not asked for" line (still present earlier in the growing log)
// cannot produce a false positive -- it must be ABSENT in this slice.
// Then repeats item 4's usePluginPlayer:false dance once more to confirm
// loginRowReplaced:false and Zotero's own two tiers back in `options`
// (matched by LABEL, since providerTierLabels() gives Zotero's own words
// for them). Closes the popup and restores usePluginPlayer to baseline
// (the run's own final state for this pref).
// Leaves the fixture tab OPEN, popup CLOSED, signed in, usePluginPlayer
// restored -- 06 erases the tab.
// params: none. state: reads fixtureItemID/fixtureTitle/baseline; writes
// nothing new.
(async () => {
  const out = { step: 'item5-signed-in-again' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function reopenPausedSettled(ir, m, fixtureTitle) {
    ir.toggleReadAloudPopup(true);
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      if (m.active && !m.paused) { try { m.pause(); } catch (e) { /* ignore */ } }
      if (m.active && m.paused) break;
      await sleep(50);
    }
    let settleLastKey = null;
    let settleStableSince = null;
    const tSettle = Date.now();
    let pt = null;
    let mine = null;
    while (Date.now() - tSettle < 6000) {
      try {
        pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
        mine = pt.readers.find((x) => x.title === fixtureTitle) || null;
      } catch (e) { /* try again */ }
      const key = JSON.stringify(mine ? { tiers: mine.tiers, options: mine.options, loginRowReplaced: mine.loginRowReplaced } : null);
      if (key === settleLastKey) {
        if (settleStableSince !== null && Date.now() - settleStableSince >= 400) break;
        if (settleStableSince === null) settleStableSince = Date.now();
      } else {
        settleLastKey = key;
        settleStableSince = Date.now();
      }
      await sleep(250);
    }
    return { active: !!m.active, paused: !!m.paused };
  }
  async function closePopup(ir) {
    ir.toggleReadAloudPopup(false);
    const t1 = Date.now();
    while (Date.now() - t1 < 10000) {
      const popupOpen = ir._state && ir._state.readAloudState ? !!ir._state.readAloudState.popupOpen : null;
      if (popupOpen === false) break;
      await sleep(100);
    }
    return ir._state && ir._state.readAloudState ? !!ir._state.readAloudState.popupOpen : null;
  }

  try {
    const itemID = S.fixtureItemID;
    const fixtureTitle = S.fixtureTitle;
    const baseline = S.baseline;
    if (!itemID || !baseline) throw new Error('state.fixtureItemID/baseline is missing -- run 00-baseline-setup.js first');

    const readers = Zotero.Reader._readers || [];
    let idx = -1;
    for (let i = 0; i < readers.length; i++) if (readers[i].itemID === itemID) idx = i;
    if (idx < 0) throw new Error('fixture reader not found');
    const r = readers[idx];
    const ir = r._internalReader;
    const m = Components.utils.waiveXrays(ir._readAloudManager);

    // --- Sign the tab back in. ---
    const signedInValue = !!Zotero.Sync.Runner.enabled;
    ir.setLoggedIn(signedInValue);
    out.signedInValueUsed = signedInValue;
    out.loggedInAfterRestore = ir._state ? ir._state.loggedIn : null;

    const debugBefore = await Zotero.Debug.get();
    const debugOffset = debugBefore.length;

    const state1 = await reopenPausedSettled(ir, m, fixtureTitle);
    out.activeAfterReopen1 = state1.active;
    out.pausedAfterReopen1 = state1.paused;

    // --- liveVoiceList(): index-match again (array order may have shifted only if a reader closed, which none did). ---
    const readers2 = Zotero.Reader._readers || [];
    let idx2 = -1;
    for (let i = 0; i < readers2.length; i++) if (readers2[i].itemID === itemID) idx2 = i;
    const lvl = JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList());
    out.liveVoiceListEntry = lvl[idx2] || null;
    out.askedTrue = lvl[idx2] ? lvl[idx2].asked === true : null;
    out.remoteTrue = lvl[idx2] ? lvl[idx2].remote === true : null;

    // --- providerTiers(): signedIn true, both Zotero tiers present. ---
    let pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    let mine = pt.readers.find((x) => x.title === fixtureTitle) || null;
    out.providerTiersFixtureAfterSignIn = mine;
    out.fixtureSignedInTrue = mine ? mine.signedIn === true : null;
    out.tiersHasStandardAndPremium = mine ? mine.tiers.includes('standard') && mine.tiers.includes('premium') : null;
    out.tiersHasFish = mine ? mine.tiers.includes('fish') : null;

    // --- Debug: no "not asked for" line in THIS open's slice. ---
    const debugAfter = await Zotero.Debug.get();
    const debugSlice = debugAfter.slice(debugOffset);
    out.debugHasNotAskedForLineThisOpen = debugSlice.includes("[zotero-tts] Zotero's own voices not asked for: no Zotero account is signed in");
    out.debugSliceLength = debugSlice.length;

    out.popupOpenAfterClose1 = await closePopup(ir);

    // --- Once more with usePluginPlayer false. ---
    Zotero.Prefs.set('zotero-tts.readAloud.usePluginPlayer', false);
    out.usePluginPlayerDuring = Zotero.Prefs.get('zotero-tts.readAloud.usePluginPlayer');
    const state2 = await reopenPausedSettled(ir, m, fixtureTitle);
    out.activeAfterReopen2 = state2.active;
    out.pausedAfterReopen2 = state2.paused;

    pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    mine = pt.readers.find((x) => x.title === fixtureTitle) || null;
    out.providerTiersFixtureNativePlayer = mine;
    out.loginRowReplacedFalse = mine ? mine.loginRowReplaced === false : null;
    const standardLabel = pt.labels && pt.labels.standard ? pt.labels.standard : null;
    const premiumLabel = pt.labels && pt.labels.premium ? pt.labels.premium : null;
    out.labelsUsed = { standard: standardLabel, premium: premiumLabel };
    out.optionsHasZoteroStandard = mine && mine.options && standardLabel ? mine.options.some((o) => o.value === 'standard' && o.label === standardLabel) : null;
    out.optionsHasZoteroPremium = mine && mine.options && premiumLabel ? mine.options.some((o) => o.value === 'premium' && o.label === premiumLabel) : null;

    out.popupOpenAfterClose2 = await closePopup(ir);

    // --- Final restore of usePluginPlayer. ---
    Zotero.Prefs.set('zotero-tts.readAloud.usePluginPlayer', baseline.usePluginPlayer.value);
    out.usePluginPlayerRestored = Zotero.Prefs.get('zotero-tts.readAloud.usePluginPlayer');
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    try { const b = S.baseline; if (b) Zotero.Prefs.set('zotero-tts.readAloud.usePluginPlayer', b.usePluginPlayer.value); } catch (e2) { /* ignore */ }
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
