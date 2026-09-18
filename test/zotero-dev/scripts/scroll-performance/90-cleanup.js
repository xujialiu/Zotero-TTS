return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const Cu = Components.utils, mw = Zotero.getMainWindow();
  const sleep = ms => new Promise(res => mw.setTimeout(res, ms));
  const VOL = 'extensions.zotero.zotero-tts.readAloud.volume';
  const base = state.baseline || {};
  const out = {};
  const id = state.fixtureID;
  if (id) {
    const r = (Zotero.Reader._readers || []).find(x => x.itemID === id);
    if (r) { try { r._internalReader.toggleReadAloudPopup(false); } catch (e) { out.popupErr = String(e); } }
    await sleep(600);
    try { const tab = mw.Zotero_Tabs._tabs.find(t => t.data && t.data.itemID === id); if (tab) mw.Zotero_Tabs.close(tab.id); }
    catch (e) { out.tabErr = String(e); }
    await sleep(500);
    try { const item = await Zotero.Items.getAsync(id); if (item) await item.eraseTx(); out.itemErased = true; }
    catch (e) { out.eraseErr = String(e); }
  }
  try { if (base.volumeHadUserValue === false) Zotero.Prefs.clear(VOL, true); else if (base.volume !== undefined) Zotero.Prefs.set(VOL, base.volume, true); }
  catch (e) { out.volErr = String(e); }
  await sleep(300);
  out.final = { volume: Zotero.Prefs.get(VOL, true),
    volumeHasUserValue: Services.prefs.getBranch('').prefHasUserValue(VOL),
    tabs: mw.Zotero_Tabs._tabs.length, windowState: mw.windowState };
  out.owners = (Zotero.Reader._readers || []).map(r => {
    const v = Cu.waiveXrays(r._internalReader._lastView || r._internalReader._primaryView);
    return { itemID: r.itemID, flowMode: v && v.flowMode, scrollY: v && v.iframeWindow ? v.iframeWindow.scrollY : null,
      popupOpen: (() => { try { return !!r._internalReader._state.readAloudState.popupOpen; } catch (e) { return null; } })() };
  });
  // the owners must be exactly as the baseline found them
  for (const was of (base.owners || [])) {
    const now = out.owners.find(o => o.itemID === was.itemID);
    if (!now) throw new Error('an owner reader disappeared: ' + was.itemID);
    if (now.scrollY !== was.scrollY) throw new Error('an owner reader was scrolled: ' + JSON.stringify({ was, now }));
  }
  return JSON.stringify(out, null, 1);
})()
