// Item 3 (issue #111): "Off hides the tier." No player is open when the
// Disable click happens (the rulebook's invariant). Captures the "both
// on" language list first (both tiers are on at the case's baseline, so
// this is the natural point for it -- the case's own parenthetical about
// item 5 just notes another point in the flow where the same list would
// hold, not a hard dependency on item 5 having run), by opening the
// fixture fresh, pausing, reading manager.languages, then closing the tab
// again so the Disable click has no player open. Reopens fresh afterward
// to check the hidden state. Leaves the tab CLOSED and Standard OFF at
// the end, for 04's own setup.
// params: fixtureItemID. state: reads baseline.readAloudMemory; writes
// standardOffLanguages (array) for the report; nothing later depends on it.
(async () => {
  const out = { step: 'disable-standard' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = Zotero.ZoteroTTSRun.params;

  function languagesArray(langs) {
    const arr = [];
    if (!langs) return arr;
    for (const lang of langs) arr.push(lang);
    return arr;
  }
  function noneWithTier(list, tier) {
    for (let i = 0; i < list.length; i++) if (list[i].tier === tier) return false;
    return true;
  }
  function tierCounts(list) {
    const counts = {};
    for (let i = 0; i < list.length; i++) {
      const tier = list[i].tier;
      counts[tier] = (counts[tier] || 0) + 1;
    }
    return counts;
  }

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
    // Settle: the catalog's async fetch (e.g. Fish's network call) can
    // still be running when the pause-loop above exits; poll providerTiers()
    // for this reader until options/tiers stop changing before returning, so
    // callers don't read a premature list. Found the hard way: an
    // immediate read once caught buildTierOptions' "nothing has voices
    // yet" fallback (Zotero's raw 3 entries, all disabled) while `tiers`
    // in the SAME read was already correct (["premium","fish"]) --
    // confirmed a timing artifact, not a product bug, by re-reading 3s
    // later without any further action and seeing the correct 2-entry list.
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

  try {
    const itemID = P.fixtureItemID;
    if (!itemID) throw new Error('params.fixtureItemID is required');

    // --- Capture the "both on" language list first. ---
    let h = await openFixturePausedFresh(itemID);
    out.bothOnSelectedTier = h.m.selectedTier;
    out.bothOnLanguages = languagesArray(h.m.languages).sort();
    S.bothOnLanguages = out.bothOnLanguages;
    await closeFixtureTab(h.win, h.tabID);
    out.closedBeforeDisable = true;

    // --- The Disable click itself, no player open. ---
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 01-pane-structure.js first');
    const doc = win.document;
    out.settingsWindowFound = true;

    const statusBefore = doc.getElementById('ztts-voices-status') ? doc.getElementById('ztts-voices-status').textContent : null;
    out.voicesStatusBefore = statusBefore;

    const toggle = doc.getElementById('ztts-enable-zotero-standard');
    const result = doc.getElementById('ztts-test-result-zotero-standard');
    toggle.click();
    // The toggle-off branch is synchronous up to prefs.set + paint (no
    // await before the write in onToggle's "enabled(id)" branch).
    await sleep(300);
    out.prefAfterDisable = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    out.toggleLabelAfterDisable = toggle.getAttribute('label');
    out.resultTextAfterDisable = result ? result.textContent : null;

    const tiersList = doc.getElementById('ztts-voices-tiers');
    await sleep(500); // onVoicesChanged() relists asynchronously
    out.voicesTiersChildrenAfterDisable = tiersList ? Array.from(tiersList.children).map((c) => c.textContent) : null;
    out.voicesStatusAfterDisable = doc.getElementById('ztts-voices-status') ? doc.getElementById('ztts-voices-status').textContent : null;

    // --- Reopen fresh: the hidden state. ---
    h = await openFixturePausedFresh(itemID);
    out.reopenedTabID = h.tabID;

    const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    // providerTiers().readers is matched by title (it carries no itemID);
    // the fixture's own title identifies its entry.
    let fixtureTitle = null;
    try { fixtureTitle = Zotero.Items.get(itemID).getField('title'); } catch (e) { /* ignore */ }
    const fixtureEntry = pt.readers.find((x) => x.title === fixtureTitle) || null;
    out.providerTiersHidden = pt.hidden;
    out.fixtureTiers = fixtureEntry ? fixtureEntry.tiers : null;
    out.fixtureOptions = fixtureEntry ? fixtureEntry.options : null;
    out.fixtureOptionsHasStandard = fixtureEntry && fixtureEntry.options ? fixtureEntry.options.some((o) => o.value === 'standard') : null;
    out.fixturePremiumOption = fixtureEntry && fixtureEntry.options ? fixtureEntry.options.find((o) => o.value === 'premium') || null : null;

    out.allVoicesNoneStandard = noneWithTier(h.m._allVoices, 'standard');
    out.allVoicesTierCounts = tierCounts(h.m._allVoices);
    out.allVoicesLength = h.m._allVoices.length;

    out.standardOffLanguages = languagesArray(h.m.languages).sort();
    S.standardOffLanguages = out.standardOffLanguages;
    out.languagesExclusiveToStandard = out.bothOnLanguages.filter((l) => !out.standardOffLanguages.includes(l));
    out.noLanguageLostExceptStandardOnly = true; // informational: the diff itself is the evidence

    const zt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.zoteroTiers());
    out.zoteroTiersAfterDisable = { switches: zt.switches, hidden: zt.hidden, standardCheckOk: zt.checks['zotero-standard'].ok };

    await closeFixtureTab(h.win, h.tabID);
    out.closedAfterCheck = true;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
