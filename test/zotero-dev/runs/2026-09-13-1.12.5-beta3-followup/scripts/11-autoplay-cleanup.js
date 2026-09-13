return (async () => {
  const state = Zotero.__ztts95AutoplayProbe;
  if (!state) throw new Error('autoplay setup is missing');
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const boundedClose = async context => {
    if (!context) return null;
    try { return await Promise.race([Promise.resolve(context.close()).then(() => 'resolved'), sleep(700).then(() => 'timeout')]); }
    catch (e) { return 'rejected: ' + String(e); }
  };
  const restore = (name, entry) => {
    if (!entry.user) { if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name); return; }
    if (typeof entry.value === 'boolean') Services.prefs.setBoolPref(name, entry.value);
    else if (Number.isInteger(entry.value)) Services.prefs.setIntPref(name, entry.value);
    else if (typeof entry.value === 'string') Services.prefs.setStringPref(name, entry.value);
  };
  const out = { itemID: state.itemID, errors: [], contextClose: {}, readerClosed: false, itemErased: false };
  try { if (state.listener && state.window?.document) state.window.document.removeEventListener('keydown', state.listener, true); } catch (e) { out.errors.push('listener: ' + String(e)); }
  out.contextClose.sync = await boundedClose(state.syncContext);
  out.contextClose.delayed = await boundedClose(state.delayedContext);
  const reader = state.reader || (Zotero.Reader._readers || []).find(r => r?.itemID === state.itemID);
  if (reader) {
    try { await Promise.resolve(reader.close?.()); out.readerClosed = true; } catch (e) { out.errors.push('reader: ' + String(e)); }
    for (let i = 0; i < 40; i++) { if (!(Zotero.Reader._readers || []).some(r => r?.itemID === state.itemID)) break; await sleep(50); }
  }
  try { const item = Zotero.Items.get(state.itemID); if (item) { await item.eraseTx(); out.itemErased = true; } } catch (e) { out.errors.push('item: ' + String(e)); }
  for (const suffix of Object.keys(state.prefs)) restore(prefix + suffix, state.prefs[suffix]);
  await sleep(250);
  if (state.selectedBefore && reader?._window?.Zotero_Tabs) { try { reader._window.Zotero_Tabs.select(state.selectedBefore); } catch (e) { out.errors.push('tab: ' + String(e)); } }
  out.remainingReader = (Zotero.Reader._readers || []).filter(r => r?.itemID === state.itemID).length;
  out.remainingItem = !!Zotero.Items.get(state.itemID);
  out.transportRestored = Object.entries(state.prefs).every(([suffix, entry]) => {
    const name = prefix + suffix;
    let value = null; try { const type = Services.prefs.getPrefType(name); value = type === Services.prefs.PREF_BOOL ? Services.prefs.getBoolPref(name) : type === Services.prefs.PREF_INT ? Services.prefs.getIntPref(name) : Services.prefs.getStringPref(name); } catch (e) {}
    return value === entry.value && Services.prefs.prefHasUserValue(name) === entry.user;
  });
  out.readerAfter = (Zotero.Reader._readers || []).map(r => {
    const internal = r?._internalReader;
    const m = internal?._readAloudManager;
    const controller = m?._controller;
    return { itemID: r?.itemID ?? null, active: !!m?.active, paused: m ? !!m.paused : null, selected: m?.selectedVoiceID ?? null, position: Number.isFinite(controller?._position) ? controller._position : null };
  });
  delete Zotero.__ztts95AutoplayProbe;
  return JSON.stringify(out, null, 1);
})()
