// Item 9 setup (issue #111): opens the fixture fresh and leaves the POPUP
// AND TAB OPEN (the item wants "the fixture tab open" across the
// reinstall) -- both tiers should already be back on from 07's restore.
// Captures the pre-reload snapshot; the tester then reinstalls the same
// xpi through the bridge (zotero_plugin_install, not a kit script) before
// running 09-after-reload.js.
// params: fixtureItemID. state: writes fixture { itemID, tabID, title }.
(async () => {
  const out = { step: 'before-reload' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = Zotero.ZoteroTTSRun.params;
  try {
    const itemID = P.fixtureItemID;
    if (!itemID) throw new Error('params.fixtureItemID is required');
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
    out.title = Zotero.Items.get(itemID).getField('title');
    S.fixture = { itemID, tabID: r.tabID, title: out.title };
    out.tabID = r.tabID;

    // Settle (see 03-disable-standard.js's kit comment): the catalog's
    // async fetch can still be running right after the pause-loop exits.
    let settleLastKey = null;
    let settleStableSince = null;
    const tSettle = Date.now();
    while (Date.now() - tSettle < 6000) {
      let mine = null;
      try {
        const p = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
        mine = p.readers.find((x) => x.title === out.title) || null;
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

    const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    out.providerTiersBefore = pt.readers.find((x) => x.title === out.title) || null;
    out.hiddenBefore = pt.hidden;
    const zt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.zoteroTiers());
    out.zoteroTiersBefore = { switches: zt.switches, hidden: zt.hidden };

    const errs = Zotero.getErrors(true) || [];
    out.errorsBeforeCount = errs.length;
    out.errorsBeforeLastTwo = errs.slice(-2).map(String);
    try {
      const log = await Zotero.Debug.get();
      out.debugLengthBefore = String(log).length;
    } catch (e) { out.debugLengthBeforeError = String(e); }
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
