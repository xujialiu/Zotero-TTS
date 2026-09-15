// Item 5 (issue #111): "On brings it back, with its memory." No player
// open (04 left the tab closed and Standard off). Click Enable beside
// Standard, poll the transient (Checking... on both the button and the
// result line, driving notes Sec2) through to the final state, then open
// the fixture fresh and pick the Standard tier (selectTier, at once) --
// selectedVoiceID should be item 4's picked voice (S.item4VoiceID), since
// the entry's memory in reader.readAloudVoices was never touched by the
// hide. Also re-checks manager.languages against 03's "both on" baseline.
// Leaves the tab CLOSED and Standard back ON at the end, for 06.
// params: fixtureItemID. state: reads item4VoiceID/item4VoiceLabel (04),
// bothOnLanguages (03); writes nothing new.
(async () => {
  const out = { step: 'enable-restores-memory' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = Zotero.ZoteroTTSRun.params;

  function languagesArray(langs) {
    const arr = [];
    if (!langs) return arr;
    for (const lang of langs) arr.push(lang);
    return arr;
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

    out.prefBefore = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    const toggle = doc.getElementById('ztts-enable-zotero-standard');
    const result = doc.getElementById('ztts-test-result-zotero-standard');
    out.toggleLabelBefore = toggle.getAttribute('label');

    toggle.click();
    const trace = [];
    const t0 = Date.now();
    let sawChecking = false;
    // Break only once the PREF itself has flipped, or -- as a fallback,
    // if the pref never moves (a failed check) -- once "Checking..." was
    // actually seen and then cleared. A break on "label is not Checking"
    // ALONE races the click: the very first read, before the synchronous
    // part of onToggle's handler has run at all, can still show the
    // pre-click "Enable" label, which also matches "not Checking" and
    // would end the loop before anything happened (found the hard way on
    // this run: a poll like that read pref:false/label:"Enable" moments
    // before a fresh, unrelated read showed pref:true/label:"Disable").
    while (Date.now() - t0 < 20000) {
      const entry = {
        t: Date.now() - t0,
        toggleLabel: toggle.getAttribute('label'),
        resultText: result ? result.textContent : null,
        pref: Zotero.Prefs.get('zotero-tts.zotero-standard.enabled'),
      };
      trace.push(entry);
      if (/checking/i.test(entry.toggleLabel || '') || /checking/i.test(entry.resultText || '')) sawChecking = true;
      if (entry.pref === true) break;
      if (sawChecking && entry.toggleLabel && !/checking/i.test(entry.toggleLabel)) break;
      await sleep(100);
    }
    out.sawChecking = sawChecking;
    out.traceFirst = trace[0] || null;
    out.traceLast = trace[trace.length - 1] || null;
    out.traceCount = trace.length;

    out.prefAfter = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    out.toggleLabelAfter = toggle.getAttribute('label');
    out.resultTextAfter = result ? result.textContent : null;

    const zt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.zoteroTiers());
    out.expectedMessage = zt.checks['zotero-standard'].message;
    out.resultMatchesExpected = out.resultTextAfter === out.expectedMessage;

    const tiersList = doc.getElementById('ztts-voices-tiers');
    await sleep(500);
    out.voicesTiersChildrenAfterEnable = tiersList ? Array.from(tiersList.children).map((c) => c.textContent) : null;

    if (out.prefAfter !== true) throw new Error('Standard did not come back on -- see trace');

    // --- Open fresh, pick the Standard tier, check the memory recall. ---
    h = await openFixturePausedFresh(itemID);
    h.m.selectTier('standard');
    const t1 = Date.now();
    while (h.m.selectedTier !== 'standard' && Date.now() - t1 < 3000) await sleep(100);
    out.selectedTierAfterPick = h.m.selectedTier;
    out.selectedVoiceIDAfterPick = h.m.selectedVoiceID ? String(h.m.selectedVoiceID) : null;
    out.item4VoiceID = S.item4VoiceID || null;
    out.memoryRecallMatches = S.item4VoiceID ? out.selectedVoiceIDAfterPick === S.item4VoiceID : null;
    if (!S.item4VoiceID) out.memoryRecallNotTestable = 'item 4 did not record a landed voice pick (see its report) -- nothing to compare against';

    out.languagesAfterEnable = languagesArray(h.m.languages).sort();
    out.bothOnLanguages = S.bothOnLanguages || null;
    out.languagesMatchBaseline = S.bothOnLanguages ? JSON.stringify(out.languagesAfterEnable) === JSON.stringify(S.bothOnLanguages) : null;

    await closeFixtureTab(h.win, h.tabID);
    h = null;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    try { if (h) await closeFixtureTab(h.win, h.tabID); } catch (e2) { /* ignore */ }
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
