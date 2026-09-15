// Investigates why item 4's "reopen the fixture and its popup" (closing
// the whole TAB, per the case's literal wording, and 04's script) reads
// lastMove: null despite selectedTierAfterReopen correctly avoiding
// "standard" (see the run report). Hypothesis, from reading
// provider-tiers.ts's retagAndMove/strandedTarget: manager._selectedTier
// only carries the OLD tier into a NEW _resolveVoice call within the SAME
// manager instance; a fresh tab makes a brand new manager whose
// _selectedTier is unset before its first _resolveVoice, so
// `if (selected === null) return null` in strandedTarget short-circuits
// before any move is recorded -- Zotero's own resolve then lands
// elsewhere directly (withoutTiers already dropped Standard's voices from
// the list it reads), with nothing "stranded" for the plugin to redirect.
// This script tests the SAME manager instance instead: selectTier
// ('standard'), close the POPUP ONLY (toggleReadAloudPopup(false) --
// found this run: this actually DEACTIVATES the manager, active goes
// false, so the hypothesis in the paragraph above does not hold as
// stated -- see managerActiveAfterPopupClose and the kit README's Limits),
// disable Standard, reopen the POPUP on the SAME tab -- if lastMove now
// populates, the hypothesis holds and item 4's own literal "close the
// tab" step is why it read null, not a product bug. The reading guard
// blocks BOTH directions while a session is open (paused counts, the
// case's own intro text); the popup left open after the reopen above
// blocks the closing "restore Standard" click below, so the tab is now
// closed and its disappearance from Zotero.Reader._readers is awaited
// BEFORE that click, not after (found this run: two 20s timeouts back to
// back when the close was fired-and-forgotten instead).
// params: fixtureItemID. state: none written; standalone investigation.
(async () => {
  const out = { step: 'lastmove-popup-only-close' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = Zotero.ZoteroTTSRun.params;

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

  let r = null;
  let win2 = null;
  let tabID = null;
  try {
    const itemID = P.fixtureItemID;
    if (!itemID) throw new Error('params.fixtureItemID is required');
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 01-pane-structure.js first');

    out.standardBefore = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    if (out.standardBefore !== true) throw new Error('expected Standard ON at the start -- see standardBefore');

    await Zotero.Reader.open(itemID);
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      r = null;
      const rs = Zotero.Reader._readers || [];
      for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID) r = rs[i];
      if (r && r._internalReader && r._internalReader._readAloudManager) break;
      await sleep(300);
    }
    if (!r) throw new Error('reader never appeared');
    win2 = Zotero.getMainWindow();
    tabID = r.tabID;
    if (win2 && win2.Zotero_Tabs && tabID) win2.Zotero_Tabs.select(tabID);
    const ir = r._internalReader;
    const m = Components.utils.waiveXrays(ir._readAloudManager);
    await ir.toggleReadAloudPopup(true);
    const t1 = Date.now();
    while (Date.now() - t1 < 60000) {
      if (m.active && !m.paused) { try { m.pause(); } catch (e) { /* ignore */ } }
      if (m.active && m.paused) break;
      await sleep(50);
    }
    await sleep(3000); // settle, see 03-disable-standard.js

    m.selectTier('standard');
    const t2 = Date.now();
    while (m.selectedTier !== 'standard' && Date.now() - t2 < 3000) await sleep(100);
    out.selectedTierAfterPick = m.selectedTier;
    if (m.selectedTier !== 'standard') throw new Error("selectTier('standard') did not land");

    // Close the POPUP ONLY -- the manager instance survives.
    await ir.toggleReadAloudPopup(false);
    out.closedPopupOnly = true;
    out.managerActiveAfterPopupClose = m.active;

    out.disable = await clickAndWaitPref(win, 'zotero-standard', false, 15000);

    // Reopen the popup on the SAME tab/manager.
    await ir.toggleReadAloudPopup(true);
    const t3 = Date.now();
    while (Date.now() - t3 < 30000) {
      if (m.active && !m.paused) { try { m.pause(); } catch (e) { /* ignore */ } }
      if (m.active && m.paused) break;
      await sleep(50);
    }
    await sleep(2000);

    const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    let fixtureTitle = null;
    try { fixtureTitle = Zotero.Items.get(itemID).getField('title'); } catch (e) { /* ignore */ }
    const mine = pt.readers.find((x) => x.title === fixtureTitle) || null;
    out.selectedTierAfterReopenSamePopup = mine ? mine.selectedTier : null;
    out.lastMoveAfterReopenSamePopup = mine ? mine.lastMove : null;
    out.sameManagerInstance = Components.utils.waiveXrays(r._internalReader._readAloudManager) === m;

    // The popup reopened above is still active (paused): the reading
    // guard blocks the restore click below until it is gone (both
    // directions, per the case's intro text) -- close the tab and WAIT
    // for it to leave Zotero.Reader._readers before clicking, or the
    // click races the guard and the poll below just burns its timeout.
    const tClose0 = Date.now();
    if (win2 && win2.Zotero_Tabs && tabID) win2.Zotero_Tabs.close(tabID);
    while (Date.now() - tClose0 < 10000) {
      const rs = Zotero.Reader._readers || [];
      if (!rs.some((x) => x.tabID === tabID)) break;
      await sleep(150);
    }
    out.closedBeforeRestoreMs = Date.now() - tClose0;
    tabID = null; // closed and confirmed gone -- the outer safety net below is now a no-op

    out.restore = await clickAndWaitPref(win, 'zotero-standard', true, 20000);
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  try {
    if (win2 && win2.Zotero_Tabs && tabID) win2.Zotero_Tabs.close(tabID);
  } catch (e) { out.closeError = String(e); }
  try {
    const win3 = Services.wm.getMostRecentWindow('zotero:pref');
    if (win3 && Zotero.Prefs.get('zotero-tts.zotero-standard.enabled') !== true) {
      out.restoreAfterError = await clickAndWaitPref(win3, 'zotero-standard', true, 20000);
    }
  } catch (e) { out.restoreAfterErrorFailed = String(e); }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
