return (async () => {
  const file = 'C:\\Users\\xujia\\orca\\workspaces\\zotero_plugin_tts\\bug_-95_2\\test\\fixtures\\fixture-a.pdf';
  const title = 'Zotero-TTS all-provider handoff fixture ' + Date.now();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.__zttsAllHandoff;
  if (!state) throw new Error('baseline script has not run');
  const out = { status: 'FAIL', title, errors: [] };
  let imported;
  try { imported = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title }); }
  catch (e) { out.errors.push('import: ' + String(e)); return JSON.stringify(out, null, 1); }
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  if (!item || !item.id) { out.errors.push('no item returned'); return JSON.stringify(out, null, 1); }
  state.fixture = { itemID: item.id, key: item.key, title };
  try {
    const result = Zotero.Reader.open(item.id, null, { openInBackground: true, allowDuplicate: false });
    if (result && typeof result.then === 'function') Promise.resolve(result).catch(e => { state.fixture.openError = String(e); });
  } catch (e) { state.fixture.openError = String(e); }
  let reader = null;
  for (let i = 0; i < 160; i++) {
    const list = Zotero.Reader._readers || [];
    for (let j = 0; j < list.length; j++) if (list[j] && list[j].itemID === item.id) { reader = list[j]; break; }
    if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
    await sleep(50);
  }
  const internal = reader && reader._internalReader;
  const manager = internal && internal._readAloudManager;
  if (!reader || !manager) { out.status = 'FAIL'; out.errors.push('reader or manager missing'); return JSON.stringify(out, null, 1); }
  state.fixture.reader = reader;
  state.fixture.readerIndex = (Zotero.Reader._readers || []).indexOf(reader);
  try {
    Zotero_Tabs.select(reader.tabID);
    reader.focus && reader.focus();
    reader._iframeWindow && reader._iframeWindow.focus && reader._iframeWindow.focus();
    internal.toggleReadAloudPopup(true);
  } catch (e) { out.errors.push('popup: ' + String(e)); }
  for (let i = 0; i < 140; i++) {
    if ((manager._allVoices || []).length && (manager._segments || []).length) break;
    await sleep(50);
  }
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) { out.errors.push('pause: ' + String(e)); } }
  const counts = {}, granularities = {}, locales = {};
  const all = manager._allVoices || [];
  for (let i = 0; i < all.length; i++) {
    const v = all[i];
    const id = String(v && v.id || '');
    const provider = id.indexOf('::') >= 0 ? id.slice(0, id.indexOf('::')) : 'native';
    counts[provider] = (counts[provider] || 0) + 1;
    const g = String(v && v.segmentGranularity || 'unknown');
    granularities[provider + '|' + g] = (granularities[provider + '|' + g] || 0) + 1;
    const language = String(v && v.language || '');
    locales[language] = (locales[language] || 0) + 1;
  }
  const c = manager._controller;
  out.status = manager._segments && manager._segments.length && all.length ? 'PASS' : 'FAIL';
  out.itemID = item.id; out.key = item.key; out.readerIndex = state.fixture.readerIndex;
  out.manager = { active: !!manager.active, paused: !!manager.paused, popupOpen: !!(internal._state && internal._state.readAloudState && internal._state.readAloudState.popupOpen), selected: manager.selectedVoiceID || null, tier: manager._selectedTier || null, segmentGranularity: manager._segmentGranularity || null, segments: manager._segments ? manager._segments.length : 0, allVoices: all.length, audioState: c && c._audioContext && c._audioContext.state || null, audioTime: c && c._audioContext && Number.isFinite(c._audioContext.currentTime) ? c._audioContext.currentTime : null };
  out.providerVoiceCounts = counts; out.providerGranularities = granularities; out.languageCount = Object.keys(locales).length;
  return JSON.stringify(out, null, 1);
})()
