// Item 1 (issue #130): "The plugin's list is asked for, Zotero's is not."
// Reads liveVoiceList()/providerTiers() for the fixture BEFORE the popup
// ever opens (both are Zotero.Reader._readers-order arrays with no itemID
// of their own -- matched here by INDEX into that same live array, read
// once). Sets the fixture tab's OWN loggedIn flag false with Zotero's own
// setter (reader._internalReader.setLoggedIn(false)) BEFORE the first
// popup open (driving notes Sec3: a bare _prepareReadAloud/setLanguage
// before the first open never renders), then opens the popup and pauses
// in the SAME script (a memory voice starts playback at once). Settles
// (polls providerTiers() for this reader until tiers/options stop
// changing, matching the zotero-tiers kit's own openFixturePausedFresh)
// before reading the "after" state. Checks: liveVoiceList() asked:false,
// remote:true, applied +1; providerTiers() signedIn:false, tiers with no
// standard/premium, retagged has a fish entry; manager._allVoices walked
// by index has no standard/premium voice; the debug output (captured only
// from this open on, via a length offset taken just before the open)
// holds the "not asked for" line; zoteroTiers() signedIn:true (the
// ACCOUNT itself, proving item 1 is a per-tab effect only).
// Leaves the popup OPEN and PAUSED for item 2.
// params: none. state: reads fixtureItemID/fixtureTabID; writes
// item1LiveVoiceListBefore/After, item1DebugOffset (for item 3's own
// "since this open" scoping is independent; kept here for reference only).
(async () => {
  const out = { step: 'item1-plugin-list-asked' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function noneWithTier(list, tiers) {
    for (let i = 0; i < list.length; i++) if (tiers.includes(list[i].tier)) return false;
    return true;
  }

  try {
    const itemID = S.fixtureItemID;
    if (!itemID) throw new Error('state.fixtureItemID is missing -- run 00-baseline-setup.js first');
    const fixtureTitle = S.fixtureTitle;

    // --- "Before the open": index-match liveVoiceList() against the live readers array. ---
    let readers = Zotero.Reader._readers || [];
    let idx = -1;
    for (let i = 0; i < readers.length; i++) if (readers[i].itemID === itemID) idx = i;
    if (idx < 0) throw new Error('fixture reader not found in Zotero.Reader._readers');
    let lvl = JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList());
    out.beforeOpen = { readersLength: readers.length, fixtureIndex: idx, entry: lvl[idx] || null };
    S.item1LiveVoiceListBefore = lvl[idx] || null;

    const r = readers[idx];
    const ir = r._internalReader;
    const m = Components.utils.waiveXrays(ir._readAloudManager);

    // --- Debug offset, captured just before touching loggedIn/the popup. ---
    const debugBefore = await Zotero.Debug.get();
    const debugOffset = debugBefore.length;

    // --- Sign the TAB out (Zotero's own setter; the account itself is untouched). ---
    ir.setLoggedIn(false);
    out.loggedInAfterSetFalse = ir._state ? ir._state.loggedIn : null;

    // --- Open the popup and pause, in this same script (driving notes Sec3). ---
    ir.toggleReadAloudPopup(true);
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      if (m.active && !m.paused) { try { m.pause(); } catch (e) { /* ignore */ } }
      if (m.active && m.paused) break;
      await sleep(50);
    }
    out.activeAfterOpen = !!m.active;
    out.pausedAfterOpen = !!m.paused;
    if (!m.active) throw new Error('the read-aloud session never became active after toggleReadAloudPopup(true)');

    // --- Settle: poll providerTiers() for this reader until tiers/options stop changing. ---
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
    out.settleMs = Date.now() - tSettle;

    // --- "After the open": liveVoiceList() again, same index. ---
    readers = Zotero.Reader._readers || [];
    idx = -1;
    for (let i = 0; i < readers.length; i++) if (readers[i].itemID === itemID) idx = i;
    lvl = JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList());
    out.afterOpen = { fixtureIndex: idx, entry: lvl[idx] || null };
    S.item1LiveVoiceListAfter = lvl[idx] || null;
    const before = S.item1LiveVoiceListBefore;
    out.appliedDelta = (lvl[idx] ? lvl[idx].applied : null) - (before ? before.applied : 0);
    out.askedFalse = lvl[idx] ? lvl[idx].asked === false : null;
    out.remoteTrue = lvl[idx] ? lvl[idx].remote === true : null;

    // --- providerTiers() for the fixture. ---
    pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    mine = pt.readers.find((x) => x.title === fixtureTitle) || null;
    out.providerTiersFixture = mine;
    out.fixtureSignedInFalse = mine ? mine.signedIn === false : null;
    out.tiersHasNoStandardOrPremium = mine ? !mine.tiers.includes('standard') && !mine.tiers.includes('premium') : null;
    out.tiersEqualsFish = mine ? JSON.stringify(mine.tiers) === JSON.stringify(['fish']) : null;
    out.retaggedHasFish = mine && mine.retagged ? (mine.retagged.fish || 0) > 0 : null;
    out.retagged = mine ? mine.retagged : null;

    // --- _allVoices walked by index: none with tier standard/premium. ---
    out.allVoicesNoneStandardOrPremium = noneWithTier(m._allVoices, ['standard', 'premium']);
    out.allVoicesLength = m._allVoices.length;

    // --- Debug output holds the "not asked for" line, scoped to this open. ---
    const debugAfter = await Zotero.Debug.get();
    const debugSlice = debugAfter.slice(debugOffset);
    out.debugHasNotAskedForLine = debugSlice.includes("[zotero-tts] Zotero's own voices not asked for: no Zotero account is signed in");
    out.debugSliceLength = debugSlice.length;

    // --- zoteroTiers(): the ACCOUNT itself stays signed in. ---
    const zt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.zoteroTiers());
    out.accountSignedInTrue = zt.signedIn === true;
    out.zoteroSwitches = zt.switches;
    out.zoteroHidden = zt.hidden;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
