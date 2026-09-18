return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const mw = Zotero.getMainWindow();
  const Cu = Components.utils;
  const VOL = 'extensions.zotero.zotero-tts.readAloud.volume';
  const has = k => Services.prefs.getBranch('').prefHasUserValue(k);
  const baseline = {
    volume: Zotero.Prefs.get(VOL, true),
    volumeHadUserValue: has(VOL),
    windowState: mw.windowState,
    tabs: mw.Zotero_Tabs._tabs.map(t => ({ id: t.id, type: t.type })),
    owners: (Zotero.Reader._readers || []).map(r => {
      const v = Cu.waiveXrays(r._internalReader._lastView || r._internalReader._primaryView);
      return { itemID: r.itemID, title: String(r._title || '').slice(0, 40), flowMode: v && v.flowMode,
        scrollY: v && v.iframeWindow ? v.iframeWindow.scrollY : null,
        popupOpen: (() => { try { return !!r._internalReader._state.readAloudState.popupOpen; } catch (e) { return null; } })(),
        active: (() => { try { return !!r._internalReader._readAloudManager.active; } catch (e) { return null; } })() };
    }),
  };
  state.baseline = baseline;
  // mute before anything can start playback
  Zotero.Prefs.set(VOL, 0, true);
  return JSON.stringify({ baseline, volumeNow: Zotero.Prefs.get(VOL, true) }, null, 1);
})()
