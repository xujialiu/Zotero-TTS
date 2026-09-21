// Item 4 (issue #130): "Zotero's original player." Sets
// zotero-tts.readAloud.usePluginPlayer false for this item only (a direct
// pref write -- readingImpact.affectedTabs() only refuses a change whose
// key prefix matches an ACTIVE session's own voice/provider, and this pref
// is not gated by the reading guard at all: it is read only by
// player.ts's watchSettings observer, which just repaints -- confirmed
// safe to write with the owner's own session elsewhere open). The fixture
// tab is still signed out (never reset since item 1); reopens its popup
// (still on the SAME reader/tab) and pauses at once, settles, then reads
// providerTiers(): loginRowReplaced:true, options = one entry per item 1's
// tiers, none of Zotero's. DOM: reads the FIXTURE'S OWN popup only (never
// the shared diagnostics.playerOptions(), which loops every reader
// including the owner's) in reader._iframeWindow.document -- the options
// panel is expanded from the moment the popup opens (showOptions starts
// true; found live -- an earlier version of this script clicked the
// Options toggle here, which COLLAPSES an already-expanded panel instead
// of opening one, a false negative) -- then checks .read-aloud-popup has
// no .row.log-in element and that the rendered text names one of the
// plugin's provider labels (the tier select itself has no selector of its
// own worth guessing at, per reader.js's TierSelect/CustomSelect -- the
// mechanism proof is providerTiers()'s own fields).
// Closes the popup and restores usePluginPlayer to its baseline value.
// Leaves the fixture tab OPEN, popup CLOSED, usePluginPlayer restored, for
// item 5.
// params: none. state: reads fixtureItemID/fixtureTitle/baseline; writes
// nothing new.
(async () => {
  const out = { step: 'item4-native-player' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    const itemID = S.fixtureItemID;
    const fixtureTitle = S.fixtureTitle;
    const baseline = S.baseline;
    if (!itemID || !baseline) throw new Error('state.fixtureItemID/baseline is missing -- run 00-baseline-setup.js first');

    Zotero.Prefs.set('zotero-tts.readAloud.usePluginPlayer', false);
    out.usePluginPlayerNow = Zotero.Prefs.get('zotero-tts.readAloud.usePluginPlayer');

    const readers = Zotero.Reader._readers || [];
    const r = readers.find((x) => x.itemID === itemID);
    if (!r) throw new Error('fixture reader not found');
    const ir = r._internalReader;
    const m = Components.utils.waiveXrays(ir._readAloudManager);
    out.stillSignedOut = ir._state ? ir._state.loggedIn === false : null;

    ir.toggleReadAloudPopup(true);
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      if (m.active && !m.paused) { try { m.pause(); } catch (e) { /* ignore */ } }
      if (m.active && m.paused) break;
      await sleep(50);
    }
    out.activeAfterReopen = !!m.active;
    out.pausedAfterReopen = !!m.paused;

    // Settle.
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

    pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    mine = pt.readers.find((x) => x.title === fixtureTitle) || null;
    out.providerTiersFixture = mine;
    out.loginRowReplacedTrue = mine ? mine.loginRowReplaced === true : null;
    out.optionsNoneAreZotero = mine && mine.options ? !mine.options.some((o) => o.value === 'standard' || o.value === 'premium') : null;
    out.optionsMatchTiers = mine && mine.options
      ? JSON.stringify(mine.options.map((o) => o.value).sort()) === JSON.stringify(mine.tiers.slice().sort())
      : null;

    // --- DOM: read the popup's already-expanded options panel (found live:
    // showOptions starts true -- the panel is expanded from the moment the
    // popup opens, with no Options click needed; clicking the toggle here
    // COLLAPSES it instead, which is what an earlier version of this script
    // did, reading a collapsed panel with neither the tier select nor the
    // log-in row rendered -- a false negative, not a product problem). ---
    const win = Components.utils.waiveXrays(r._iframeWindow);
    const doc = win.document;
    const popup = doc.querySelector('.read-aloud-popup');
    out.popupFound = !!popup;
    if (popup) {
      out.popupExpandedClass = popup.className;
      out.popupAlreadyExpanded = /expanded/.test(popup.className);
      const logInRow = popup.querySelector('.row.log-in');
      out.logInRowPresent = !!logInRow;
      const fishLabel = pt.labels && pt.labels.fish ? pt.labels.fish : 'Fish Audio';
      out.popupTextIncludesProviderLabel = popup.textContent.includes(fishLabel);
      out.providerLabelChecked = fishLabel;
    }

    // Close the popup.
    ir.toggleReadAloudPopup(false);
    const t1 = Date.now();
    while (Date.now() - t1 < 10000) {
      const popupOpen = ir._state && ir._state.readAloudState ? !!ir._state.readAloudState.popupOpen : null;
      if (popupOpen === false) break;
      await sleep(100);
    }
    out.popupOpenAfterClose = ir._state && ir._state.readAloudState ? !!ir._state.readAloudState.popupOpen : null;

    // Restore usePluginPlayer.
    Zotero.Prefs.set('zotero-tts.readAloud.usePluginPlayer', baseline.usePluginPlayer.value);
    out.usePluginPlayerRestored = Zotero.Prefs.get('zotero-tts.readAloud.usePluginPlayer');
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    // Best-effort restore even on failure, so a later item is not left broken.
    try { const b = S.baseline; if (b) Zotero.Prefs.set('zotero-tts.readAloud.usePluginPlayer', b.usePluginPlayer.value); } catch (e2) { /* ignore */ }
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
