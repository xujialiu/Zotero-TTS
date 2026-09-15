// Item 3's language-coverage sub-check, corrected: manager.languages is
// SCOPED TO THE CURRENTLY SELECTED TIER (confirmed empirically this run --
// "both on" captured while selectedTier was "standard" read only Standard's
// own 9 languages, matching Standard's voice count exactly; the same
// capture on an earlier run, coincidentally made while selectedTier was
// "fish", read ~67 languages matching Fish's own coverage). It is NOT the
// union the case's item 3 wants to compare ("no language that only
// Standard voices covered"), and which tier happens to be selected is an
// accident of the memory voice at capture time, not a controlled
// variable. manager._allVoices IS the tier-independent, global list (the
// mechanism note: the composite interface drops a hidden tier's key from
// it before anything reads it) and each entry carries `.locale`, so this
// script computes language coverage directly from _allVoices, by index
// (reader-realm pitfall), with both tiers on and with Standard hidden, and
// diffs them -- the actual, tier-independent version of item 3's check.
// params: fixtureItemID. state: none written; standalone re-check.
(async () => {
  const out = { step: 'language-coverage-allvoices' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = Zotero.ZoteroTTSRun.params;

  async function openFixturePausedFresh(itemID) {
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
    // Settle (see 03-disable-standard.js): let the catalog's async fetch finish.
    await sleep(3000);
    return { r, ir, m, win: mainWin, tabID: r.tabID };
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
  function languageCoverage(list) {
    // The reader-realm voice object's field is `.language` (a prototype
    // getter: constructor, id, label, language, score, segmentGranularity,
    // creditsPerMinute, tier, default, sentenceDelay, ...) -- NOT `.locale`
    // (that name belongs to the plugin's own separate BrowserVoice type in
    // ui/voice-browser-rows.ts, a different object; found the hard way,
    // first attempt read every entry's `.locale` as undefined).
    const set = new Set();
    for (let i = 0; i < list.length; i++) {
      const lang = list[i].language;
      if (lang) set.add(lang);
    }
    return Array.from(set).sort();
  }
  async function clickAndWaitPref(win, id, target, maxMs) {
    const doc = win.document;
    const toggle = doc.getElementById('ztts-enable-' + id);
    toggle.click();
    const t0 = Date.now();
    let sawChecking = false;
    while (Date.now() - t0 < maxMs) {
      const label = toggle.getAttribute('label');
      if (/checking/i.test(label || '')) sawChecking = true;
      if (Zotero.Prefs.get('zotero-tts.' + id + '.enabled') === target) break;
      if (sawChecking && label && !/checking/i.test(label)) break;
      await sleep(150);
    }
    return { pref: Zotero.Prefs.get('zotero-tts.' + id + '.enabled'), label: toggle.getAttribute('label') };
  }

  let h = null;
  try {
    const itemID = P.fixtureItemID;
    if (!itemID) throw new Error('params.fixtureItemID is required');
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 01-pane-structure.js first');

    out.standardBefore = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    if (out.standardBefore !== true) throw new Error('expected Standard ON at the start of this check -- see standardBefore');

    // --- Both on. ---
    h = await openFixturePausedFresh(itemID);
    out.oneVoiceShape = h.m._allVoices.length ? Object.keys(Components.utils.waiveXrays(h.m._allVoices[0])) : null;
    out.allVoicesLengthBothOn = h.m._allVoices.length;
    out.bothOnCoverage = languageCoverage(h.m._allVoices);
    await closeFixtureTab(h.win, h.tabID);
    h = null;

    // --- Disable Standard. ---
    out.disable = await clickAndWaitPref(win, 'zotero-standard', false, 15000);

    // --- Reopen: Standard hidden. ---
    h = await openFixturePausedFresh(itemID);
    out.allVoicesLengthStandardOff = h.m._allVoices.length;
    out.standardOffCoverage = languageCoverage(h.m._allVoices);
    await closeFixtureTab(h.win, h.tabID);
    h = null;

    out.lostToDisabling = out.bothOnCoverage.filter((l) => !out.standardOffCoverage.includes(l));
    out.gainedFromDisabling = out.standardOffCoverage.filter((l) => !out.bothOnCoverage.includes(l));

    // --- Restore Standard. ---
    out.restore = await clickAndWaitPref(win, 'zotero-standard', true, 20000);
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    try { if (h) await closeFixtureTab(h.win, h.tabID); } catch (e2) { /* ignore */ }
    // Best-effort: make sure Standard ends up back on even after a throw.
    try {
      const win2 = Services.wm.getMostRecentWindow('zotero:pref');
      if (win2 && Zotero.Prefs.get('zotero-tts.zotero-standard.enabled') !== true) {
        out.restoreAfterError = await clickAndWaitPref(win2, 'zotero-standard', true, 20000);
      }
    } catch (e3) { out.restoreAfterErrorFailed = String(e3); }
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
