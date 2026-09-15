// Opens the standing fixture (params.fixtureItemID), waits for
// _internalReader/_readAloudManager, opens its popup and pauses it in this
// same script (rulebook step 2/"How to drive"), then folds in item 1/2 of
// the case: providerTiers()/patches() read right after the popup opened,
// with both Fish and System enabled. Guards the memory voice for `::`
// before opening any popup (Zotero's credits are the user's).
// params: fixtureItemID. state: reads baseline.readAloudMemory; writes
// fixture { itemID, tabID, title } for later scripts, patchesBeforeOpen.
(async () => {
  const out = { step: 'open-fixture-item1' };
  const P = Zotero.ZoteroTTSRun.params;
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const itemID = P.fixtureItemID;
    if (!itemID) throw new Error('params.fixtureItemID is required');
    const item = Zotero.Items.get(itemID);
    if (!item) throw new Error('no item with id ' + itemID);
    out.title = item.getField('title');

    const memoryVoice = S.baseline && S.baseline.readAloudMemory ? (() => {
      try { return JSON.parse(S.baseline.readAloudMemory.value || '{}').voice; } catch (e) { return null; }
    })() : null;
    out.memoryVoiceBefore = memoryVoice;
    out.memoryVoiceHasNamespace = memoryVoice ? String(memoryVoice).includes('::') : null;
    if (memoryVoice && !String(memoryVoice).includes('::')) {
      out.memoryVoiceWarning = 'the remembered voice has no :: -- a metered Zotero voice would start; not overridden automatically, reported for the caller to decide';
    }

    try {
      out.patchesBeforeOpen = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).providerTiers;
    } catch (e) { out.patchesBeforeOpenError = String(e); }

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
    if (!r || !r._internalReader || !r._internalReader._readAloudManager) {
      throw new Error('reader or read-aloud manager never appeared for item ' + itemID);
    }
    out.readerReadyMs = Date.now() - t0;
    out.tabID = r.tabID;
    S.fixture = { itemID, tabID: r.tabID, title: out.title };

    const mainWin = Zotero.getMainWindow();
    if (mainWin && mainWin.Zotero_Tabs && r.tabID) mainWin.Zotero_Tabs.select(r.tabID);
    out.selected = mainWin && mainWin.Zotero_Tabs ? mainWin.Zotero_Tabs.selectedID === r.tabID : null;

    const ir = r._internalReader;
    const m = ir._readAloudManager;
    out.before = { active: m.active, paused: m.paused, voice: m.selectedVoiceID ? String(m.selectedVoiceID) : null };
    await ir.toggleReadAloudPopup(true);
    out.pauses = [];
    const t1 = Date.now();
    while (Date.now() - t1 < 60000) {
      if (m.active && !m.paused) {
        try { m.pause(); out.pauses.push(Date.now() - t1); } catch (e) { out.pauseError = String(e); }
      }
      if (m.active && m.paused) break;
      await sleep(50);
    }
    out.playerReadyMs = Date.now() - t1;
    out.after = { active: m.active, paused: m.paused, voice: m.selectedVoiceID ? String(m.selectedVoiceID) : null, selectedTier: m._selectedTier };

    // Item 1/2: providerTiers() + patches() right after the popup opened.
    const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    out.feature = pt.feature;
    out.labels = pt.labels;
    const mine = pt.readers.find((x) => x.title === out.title);
    out.fixtureReader = mine || null;
    out.patchesAfterOpen = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).providerTiers;

    try {
      const log = await Zotero.Debug.get();
      const lines = String(log).split('\n').filter((l) => l.includes('provider tiers') || l.includes('re-tagged'));
      out.debugLines = lines.slice(-6);
    } catch (e) { out.debugLinesError = String(e); }
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out);
})();
