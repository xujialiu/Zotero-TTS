// Everything this case touched, put back: the copies' tabs closed and the items
// erased, the prefs restored to their snapshotted value AND user-value state
// (readAloud.memory written last, as the rule asks), the tab the owner had
// selected reselected, the debug store back where it was. Safe to run twice.
(async () => {
  const out = { step: 'cleanup', closed: [], erased: [], stillThere: [], prefs: {} };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const copies = S.copies || [];
  out.copies = copies.length;
  for (let i = 0; i < copies.length; i++) {
    const c = copies[i];
    try {
      const rs = Zotero.Reader._readers || [];
      let r = null;
      for (let j = 0; j < rs.length; j++) if (rs[j].itemID === c.itemID) r = rs[j];
      if (r) {
        const win = Zotero.getMainWindow();
        if (win && win.Zotero_Tabs && r.tabID) win.Zotero_Tabs.close(r.tabID);
        else if (typeof r.close === 'function') r.close();
        await sleep(400);
        out.closed.push(c.itemID);
      }
    } catch (e) { out.closeError = (out.closeError || '') + ' ' + c.itemID + ':' + String(e); }
    try {
      const item = Zotero.Items.get(c.itemID);
      if (item) { await item.eraseTx(); out.erased.push(c.itemID); }
    } catch (e) { out.eraseError = (out.eraseError || '') + ' ' + c.itemID + ':' + String(e); }
  }
  await sleep(300);
  for (let i = 0; i < copies.length; i++) {
    try {
      const still = await Zotero.Items.getAsync(copies[i].itemID);
      if (still) out.stillThere.push(copies[i].itemID);
    } catch (e) { /* getAsync throws for a gone item in some builds: that is gone */ }
  }
  out.allErased = out.stillThere.length === 0;

  const snap = S.snapshot;
  if (snap && snap.prefs) {
    const order = ['readAloud.volume', 'readAloud.joinSplitSentences', 'readAloud.restoreSkippedLines', 'readAloud.memory'];
    for (let i = 0; i < order.length; i++) {
      const name = order[i];
      const rec = snap.prefs[name];
      if (!rec) continue;
      const full = 'extensions.zotero.zotero-tts.' + name;
      try {
        if (rec.userValue) Zotero.Prefs.set('zotero-tts.' + name, rec.value);
        else if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full);
        out.prefs[name] = { value: Zotero.Prefs.get('zotero-tts.' + name), userValue: Services.prefs.prefHasUserValue(full), wantedUserValue: rec.userValue, restored: Zotero.Prefs.get('zotero-tts.' + name) === rec.value && Services.prefs.prefHasUserValue(full) === rec.userValue };
      } catch (e) { out.prefs[name] = { error: String(e) }; }
    }
  } else { out.prefs = { error: 'no snapshot in state — nothing restored' }; }

  try {
    if (snap && snap.selectedTabID) {
      const win = Zotero.getMainWindow();
      if (win && win.Zotero_Tabs) { win.Zotero_Tabs.select(snap.selectedTabID); out.selectedTab = win.Zotero_Tabs.selectedID; }
    }
  } catch (e) { out.tabError = String(e); }
  try {
    if (snap && snap.debugStoring === false && Zotero.Debug.storing) { Zotero.Debug.setStore(false); }
    out.debugStoring = Zotero.Debug.storing;
    out.debugStoringWanted = snap ? snap.debugStoring : null;
  } catch (e) { out.debugError = String(e); }
  try {
    const rs = Zotero.Reader._readers || [];
    out.readersAfter = [];
    for (let i = 0; i < rs.length; i++) {
      const ir = rs[i]._internalReader;
      const m = ir && ir._readAloudManager;
      out.readersAfter.push({ i, itemID: rs[i].itemID, tabID: rs[i].tabID, active: m ? m.active : null, paused: m ? m.paused : null });
    }
  } catch (e) { out.readersError = String(e); }
  return JSON.stringify(out);
})()
